import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, withTenant, TENANT_SESSION_VARIABLE } from '@atlas/db';
import type { Env } from '@atlas/config';
import type { SchoolStatus } from '@atlas/domain';
import type { NotificationChannel } from '@atlas/notifications';
import { AppHttpException } from '../../common/app-http-exception.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { AuditService } from '../operations/audit-event.service.js';
import { AccessGateService } from './access-gate.service.js';
import { generateUniqueSchoolSubdomain } from './subdomain-generator.js';
import {
  SCHOOL_ACTIVATION_TEMPLATE_NAME,
  SUBSCRIPTION_RENEWAL_TEMPLATE_NAME,
} from './templates.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { IssueSubscriptionDto } from './dto/school-lifecycle.dto.js';
import type { SchoolDetailResponseDto, SchoolListItemDto } from './dto/school-response.dto.js';

// The ActivationGrant's own redemption window — how long the emailed key
// stays valid, distinct from the Subscription period it activates. No
// concrete value is specified anywhere; an engineering default, easy to
// make configurable later (same status as the warning thresholds in
// @atlas/domain's access-gate.ts).
const ACTIVATION_GRANT_VALIDITY_DAYS = 14;

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateActivationKey(): string {
  // Base32-ish, unambiguous alphabet — this is typed/copy-pasted by a human
  // (mirrors PasswordService.generateInitialPassword's own alphabet choice
  // and reasoning), not a machine-only token like a session bearer value.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  // Grouped for human readability, e.g. "ABCD-EFGH-JKMN-PQRS".
  return raw.match(/.{1,4}/g)!.join('-');
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** `School.status === 'PROVISIONAL'` means no ActivationGrant has ever been
 * redeemed for it yet — the natural, single-source way to tell "this is the
 * school's first activation" from "this is a renewal", without inspecting
 * grant history. */
function grantPurposeFor(schoolStatus: SchoolStatus): 'INITIAL_ACTIVATION' | 'RENEWAL' {
  return schoolStatus === 'PROVISIONAL' ? 'INITIAL_ACTIVATION' : 'RENEWAL';
}

@Injectable()
export class SchoolsAdminService {
  constructor(
    private readonly accessGate: AccessGateService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Builds a school-subdomain URL for a link sent by email — never a
   * hardcoded domain (no commercial product domain is decided yet; see
   * PROJECT.md's "Project Atlas" codename note and CLAUDE.md). Reuses the
   * same two env vars ADR-0005/ADR-0022 already established for exactly
   * this purpose: `PLATFORM_ROOT_DOMAIN` for the subdomain-bearing root
   * (the same value TenancyMiddleware resolves Host headers against), and
   * `WEB_ORIGIN` only for its scheme/port — `WEB_ORIGIN` itself is a
   * single fixed origin (a local-dev CORS escape hatch per
   * `security/cors.ts`'s own doc comment) and is never subdomain-aware, so
   * only its scheme/port are reused, never its host.
   */
  private buildSchoolUrl(subdomain: string, path: string): string {
    const webOrigin = new URL(this.config.get('WEB_ORIGIN', { infer: true }));
    const rootDomain = this.config.get('PLATFORM_ROOT_DOMAIN', { infer: true });
    const port = webOrigin.port ? `:${webOrigin.port}` : '';
    return `${webOrigin.protocol}//${subdomain}.${rootDomain}${port}${path}`;
  }

  async list(status?: SchoolStatus[]): Promise<SchoolListItemDto[]> {
    const schools = await prisma.school.findMany({
      ...(status && status.length > 0 ? { where: { status: { in: status } } } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      schools.map(async (school) => {
        const studentCount = await this.countByRole(school.id, 'STUDENT');
        return {
          id: school.id,
          name: school.name,
          subdomain: school.subdomain,
          status: school.status,
          studentCount,
          createdAt: school.createdAt.toISOString(),
        };
      }),
    );
  }

  /**
   * Creates School(PROVISIONAL) + the initial School Admin (User: INVITED,
   * no password yet — SchoolMembership + RoleAssignment) + a PENDING
   * Subscription + an INITIAL_ACTIVATION ActivationGrant, atomically. School
   * itself carries no RLS (it's the tenant root — see its own schema doc
   * comment), so its id isn't known until partway through; a manual
   * `prisma.$transaction` (rather than `withTenant`, which needs the
   * schoolId upfront) creates it first and then sets the RLS session
   * variable for the rest of the statements in the same transaction — the
   * same primitive `withTenant` itself wraps, inlined here for this one
   * case where the schoolId is generated mid-transaction rather than
   * supplied by the caller.
   */
  async create(
    dto: CreateSchoolDto,
    issuedByUserId: string,
  ): Promise<{ id: string; subdomain: string }> {
    const subdomain = await generateUniqueSchoolSubdomain(
      dto.name,
      async (candidate) =>
        (await prisma.school.findUnique({ where: { subdomain: candidate } })) !== null,
    );

    const rawKey = generateActivationKey();
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({ data: { name: dto.name, subdomain } });

      await tx.$executeRaw`SELECT set_config(${TENANT_SESSION_VARIABLE}, ${school.id}, true)`;

      const admin = await tx.user.create({
        data: {
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          displayName: `${dto.adminFirstName} ${dto.adminLastName}`,
          email: dto.adminEmail,
        },
      });
      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: admin.id,
          loginIdentifier: dto.adminLoginIdentifier,
          status: 'ACTIVE',
        },
      });
      await tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
      });

      const subscription = await tx.subscription.create({
        data: {
          schoolId: school.id,
          plan: dto.plan,
          startAt: now,
          expiresAt: addDays(now, dto.initialPeriodDays),
        },
      });
      await tx.activationGrant.create({
        data: {
          schoolId: school.id,
          subscriptionId: subscription.id,
          purpose: 'INITIAL_ACTIVATION',
          keyHash: hashKey(rawKey),
          issuedBy: issuedByUserId,
          expiresAt: addDays(now, ACTIVATION_GRANT_VALIDITY_DAYS),
        },
      });

      return { school, admin };
    });

    await this.audit.record({
      schoolId: result.school.id,
      actorUserId: issuedByUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: 'PLATFORM_SCHOOL_CREATED',
      entityType: 'School',
      entityId: result.school.id,
    });

    await this.notifications.send({
      to: dto.adminEmail,
      template: SCHOOL_ACTIVATION_TEMPLATE_NAME,
      variables: {
        displayName: result.admin.displayName,
        schoolName: dto.name,
        // The activation screen itself is F4 scope — only the key/query
        // contract is fixed here, matching identity.service.ts's own
        // "placeholder route" precedent for the password-reset link.
        activationUrl: this.buildSchoolUrl(subdomain, `/activate?key=${rawKey}`),
      },
    });

    return { id: result.school.id, subdomain };
  }

  async detail(schoolId: string): Promise<SchoolDetailResponseDto> {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });

    const subscription = await withTenant(prisma, schoolId, (tx) =>
      tx.subscription.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' } }),
    );

    const [students, teachers] = await Promise.all([
      this.countByRole(schoolId, 'STUDENT'),
      this.countByRole(schoolId, 'TEACHER'),
    ]);

    return {
      id: school.id,
      name: school.name,
      subdomain: school.subdomain,
      status: school.status,
      shortName: school.shortName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      timezone: school.timezone,
      createdAt: school.createdAt.toISOString(),
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            startAt: subscription.startAt.toISOString(),
            expiresAt: subscription.expiresAt.toISOString(),
          }
        : null,
      usage: {
        students,
        teachers,
        // Exams/attempts don't exist until B11/B13 — see the DTO's own
        // field-level doc comments.
        exams: 0,
        attempts: 0,
      },
    };
  }

  async suspend(schoolId: string, reason: string, actorUserId: string): Promise<void> {
    await this.setPlatformOverride(
      schoolId,
      'SUSPENDED',
      reason,
      actorUserId,
      'PLATFORM_SCHOOL_SUSPENDED',
    );
  }

  async reactivate(schoolId: string, reason: string, actorUserId: string): Promise<void> {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });

    if (school.platformOverride !== 'SUSPENDED') {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'Only a suspended school can be reactivated.',
      });
    }

    await prisma.school.update({ where: { id: schoolId }, data: { platformOverride: null } });
    await this.audit.record({
      schoolId,
      actorUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: 'PLATFORM_SCHOOL_REACTIVATED',
      reason,
      entityType: 'School',
      entityId: schoolId,
    });
    await this.accessGate.recompute(schoolId);
  }

  async deactivate(schoolId: string, reason: string, actorUserId: string): Promise<void> {
    await this.setPlatformOverride(
      schoolId,
      'DEACTIVATED',
      reason,
      actorUserId,
      'PLATFORM_SCHOOL_DEACTIVATED',
    );
  }

  /**
   * "Issue or renew" (roadmap). If the school has no current non-terminal
   * subscription (first-ever, or the prior one already lapsed to EXPIRED),
   * a fresh row is created. Otherwise — a real B3 correction found while
   * implementing, not in the original plan text — the partial unique index
   * `subscriptions_one_non_terminal_per_school` (this migration) forbids a
   * second PENDING/ACTIVE/EXPIRING row for the same school, so "renew"
   * instead extends the *same* row: `periodDays` is added on top of
   * whichever is later, `now` or the current `expiresAt` (so renewing
   * early doesn't waste remaining paid time), and a lapsed EXPIRING status
   * resets to ACTIVE.
   */
  async issueSubscription(
    schoolId: string,
    dto: IssueSubscriptionDto,
    issuedByUserId: string,
  ): Promise<{ subscriptionId: string }> {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });

    const now = new Date();
    const current = await withTenant(prisma, schoolId, (tx) =>
      tx.subscription.findFirst({
        where: { schoolId, status: { in: ['PENDING', 'ACTIVE', 'EXPIRING'] } },
      }),
    );

    const subscription = await withTenant(prisma, schoolId, (tx) => {
      if (current) {
        const base = current.expiresAt > now ? current.expiresAt : now;
        return tx.subscription.update({
          where: { id: current.id },
          data: {
            plan: dto.plan,
            expiresAt: addDays(base, dto.periodDays),
            status: current.status === 'PENDING' ? 'PENDING' : 'ACTIVE',
            lastWarningThresholdDays: null,
          },
        });
      }
      return tx.subscription.create({
        data: { schoolId, plan: dto.plan, startAt: now, expiresAt: addDays(now, dto.periodDays) },
      });
    });

    await this.issueGrantForSubscription(schoolId, subscription.id, issuedByUserId, school.status);
    await this.audit.record({
      schoolId,
      actorUserId: issuedByUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: 'PLATFORM_SUBSCRIPTION_ISSUED',
      entityType: 'Subscription',
      entityId: subscription.id,
    });
    await this.accessGate.recompute(schoolId);

    return { subscriptionId: subscription.id };
  }

  /** "Issue key" (roadmap's separate endpoint) — a standalone renewal key
   * against the *current* subscription period, without changing any dates.
   * Useful when the original grant expired unredeemed or the email was
   * lost. */
  async issueActivationGrant(
    schoolId: string,
    issuedByUserId: string,
  ): Promise<{ subscriptionId: string }> {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });

    const subscription = await withTenant(prisma, schoolId, (tx) =>
      tx.subscription.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' } }),
    );
    if (!subscription) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'This school has no subscription to issue a key against yet.',
      });
    }

    await this.issueGrantForSubscription(schoolId, subscription.id, issuedByUserId, school.status);
    return { subscriptionId: subscription.id };
  }

  // --- internal helpers ---------------------------------------------------

  private async issueGrantForSubscription(
    schoolId: string,
    subscriptionId: string,
    issuedByUserId: string,
    schoolStatus: SchoolStatus,
  ): Promise<void> {
    const rawKey = generateActivationKey();
    const now = new Date();
    const purpose = grantPurposeFor(schoolStatus);

    await withTenant(prisma, schoolId, async (tx) => {
      // Single-use enforcement (the partial unique index) means at most one
      // ISSUED grant may exist per subscription — revoke any still-open one
      // before issuing a fresh key, matching "a redeemed key is rejected on
      // replay" DoD language applied to the re-issue case too.
      await tx.activationGrant.updateMany({
        where: { subscriptionId, status: 'ISSUED' },
        data: { status: 'REVOKED' },
      });
      await tx.activationGrant.create({
        data: {
          schoolId,
          subscriptionId,
          purpose,
          keyHash: hashKey(rawKey),
          issuedBy: issuedByUserId,
          expiresAt: addDays(now, ACTIVATION_GRANT_VALIDITY_DAYS),
        },
      });
    });

    const admin = await this.findSchoolAdmin(schoolId);
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    if (!admin?.email) return;

    // A real bug found via integration testing (not by inspection): this
    // used to always send the renewal-wording template regardless of
    // `purpose`, so a re-issued *initial* activation key (school still
    // PROVISIONAL — e.g. the original email was lost) would tell the new
    // School Admin "Enter it from your subscription screen", which doesn't
    // exist yet since the school hasn't been activated at all.
    if (purpose === 'INITIAL_ACTIVATION') {
      await this.notifications.send({
        to: admin.email,
        template: SCHOOL_ACTIVATION_TEMPLATE_NAME,
        variables: {
          displayName: admin.displayName,
          schoolName: school.name,
          activationUrl: this.buildSchoolUrl(school.subdomain, `/activate?key=${rawKey}`),
        },
      });
    } else {
      await this.notifications.send({
        to: admin.email,
        template: SUBSCRIPTION_RENEWAL_TEMPLATE_NAME,
        variables: { displayName: admin.displayName, schoolName: school.name, renewalKey: rawKey },
      });
    }
  }

  private async setPlatformOverride(
    schoolId: string,
    override: 'SUSPENDED' | 'DEACTIVATED',
    reason: string,
    actorUserId: string,
    action: string,
  ): Promise<void> {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });

    await prisma.school.update({ where: { id: schoolId }, data: { platformOverride: override } });
    await this.audit.record({
      schoolId,
      actorUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action,
      reason,
      entityType: 'School',
      entityId: schoolId,
    });
    await this.accessGate.recompute(schoolId);
  }

  private async countByRole(schoolId: string, role: 'STUDENT' | 'TEACHER'): Promise<number> {
    return withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.count({ where: { schoolId, role, status: 'ACTIVE' } }),
    );
  }

  private async findSchoolAdmin(
    schoolId: string,
  ): Promise<{ email: string | null; displayName: string } | null> {
    const assignment = await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.findFirst({
        where: { schoolId, role: 'SCHOOL_ADMIN', status: 'ACTIVE' },
        include: { membership: { include: { user: true } } },
      }),
    );
    if (!assignment) return null;
    return {
      email: assignment.membership.user.email,
      displayName: assignment.membership.user.displayName,
    };
  }
}
