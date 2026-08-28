import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { PasswordService } from '../identity/password.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { AccessGateService } from './access-gate.service.js';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

// Mirrors the ActivationGrantPurpose Prisma enum's values as a local type
// alias (same convention as @atlas/domain's Role — a hand-kept mirror —
// rather than importing a Prisma-generated type across the package
// boundary; @atlas/db deliberately re-exports only prisma/withTenant/Prisma
// namespace, not individual model/enum types).
type ActivationGrantPurpose = 'INITIAL_ACTIVATION' | 'RENEWAL';

function invalidKey(): AppHttpException {
  // The one response for "no such key", "belongs to a different school",
  // and "revoked" — enumeration-resistant by design (see
  // @atlas/domain's error-codes.ts doc comment on ACTIVATION_KEY_INVALID).
  return new AppHttpException({
    code: 'ACTIVATION_KEY_INVALID',
    message: 'This activation key is invalid.',
  });
}

/**
 * `03 §3`'s School-side activation flow. Deliberately resolves the target
 * grant *scoped to the already-resolved tenant*
 * (`TenancyContextService.schoolId`, from the Host-header subdomain the
 * caller is visiting — ADR-0005), never by searching across all schools:
 * `ActivationGrant` is RLS-protected, so a key issued for School A queried
 * while resolved on School B's subdomain simply isn't visible at all
 * (proven by `tests/tenancy/rls.integration.test.ts`'s "even by primary
 * key" case) — the same RLS mechanism that gives every other school-owned
 * table its cross-tenant isolation gives this endpoint its enumeration-
 * resistant cross-school rejection for free, no extra check needed.
 *
 * Both INITIAL_ACTIVATION and RENEWAL redemption are reachable
 * unauthenticated: possession of a valid, unexpired, unredeemed key is the
 * authorization for either — a deliberate simplification found while
 * implementing (the original B3 plan sketched an additional "renewal must
 * also be authenticated as School Admin" check; dropped as redundant, since
 * the key is already single-use and school-scoped, and `Subscription`'s own
 * commercial dates are only ever changed by Software Admin's issuance —
 * see SchoolsAdminService — never by redemption itself).
 */
@Injectable()
export class ActivationService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly accessGate: AccessGateService,
    private readonly audit: AuditService,
  ) {}

  async verify(
    schoolId: string,
    rawKey: string,
  ): Promise<{ schoolName: string; purpose: ActivationGrantPurpose; requiresPassword: boolean }> {
    const grant = await this.findRedeemableGrant(schoolId, rawKey);
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    return {
      schoolName: school.name,
      purpose: grant.purpose,
      requiresPassword: grant.purpose === 'INITIAL_ACTIVATION',
    };
  }

  async redeem(
    schoolId: string,
    rawKey: string,
    newPassword: string | undefined,
  ): Promise<{ status: 'ok'; loginIdentifier: string }> {
    const grant = await this.findRedeemableGrant(schoolId, rawKey);
    const admin = await this.findSchoolAdmin(schoolId);
    if (!admin) throw invalidKey();

    if (grant.purpose === 'INITIAL_ACTIVATION') {
      if (admin.status !== 'INVITED') throw invalidKey();
      if (!newPassword) {
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          httpStatus: 400,
          message: 'A password is required to complete activation.',
        });
      }
      const passwordHash = await this.passwords.hash(newPassword);
      await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash, status: 'ACTIVE', credentialState: 'OK' },
      });
    }

    await withTenant(prisma, schoolId, async (tx) => {
      await tx.activationGrant.update({
        where: { id: grant.id },
        data: { status: 'ACTIVATED', activatedAt: new Date() },
      });
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: grant.subscriptionId },
      });
      if (subscription.status !== 'ACTIVE') {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'ACTIVE' },
        });
      }
    });

    await this.accessGate.recompute(schoolId);
    await this.audit.record({
      schoolId,
      actorUserId: admin.id,
      actorRole: 'SCHOOL_ADMIN',
      action:
        grant.purpose === 'INITIAL_ACTIVATION'
          ? 'ACTIVATION_GRANT_REDEEMED_INITIAL'
          : 'ACTIVATION_GRANT_REDEEMED_RENEWAL',
      entityType: 'ActivationGrant',
      entityId: grant.id,
    });

    return { status: 'ok' as const, loginIdentifier: admin.loginIdentifier };
  }

  private async findRedeemableGrant(schoolId: string, rawKey: string) {
    const grant = await withTenant(prisma, schoolId, (tx) =>
      tx.activationGrant.findUnique({ where: { keyHash: hashKey(rawKey) } }),
    );
    if (!grant) throw invalidKey();
    if (grant.status === 'ACTIVATED') {
      throw new AppHttpException({
        code: 'ACTIVATION_KEY_ALREADY_USED',
        message: 'This activation key has already been used.',
      });
    }
    if (grant.status === 'REVOKED') throw invalidKey();
    if (grant.status === 'EXPIRED' || grant.expiresAt < new Date()) {
      throw new AppHttpException({
        code: 'ACTIVATION_KEY_EXPIRED',
        message: 'This activation key has expired.',
      });
    }
    return grant;
  }

  private async findSchoolAdmin(
    schoolId: string,
  ): Promise<{ id: string; status: string; loginIdentifier: string } | null> {
    const assignment = await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.findFirst({
        where: { schoolId, role: 'SCHOOL_ADMIN', status: 'ACTIVE' },
        include: { membership: { include: { user: true } } },
      }),
    );
    if (!assignment) return null;
    return {
      id: assignment.membership.user.id,
      status: assignment.membership.user.status,
      loginIdentifier: assignment.membership.loginIdentifier,
    };
  }
}
