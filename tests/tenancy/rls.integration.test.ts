/**
 * B0 Definition of Done #6: "A cross-tenant access attempt is blocked by
 * the tenancy primitive and a test proves it." Also the B0 Testing
 * requirements table's "Security | Cross-tenant RLS probe."
 *
 * Runs against `school_memberships` — B1's first real school-owned table,
 * replacing the B0-era `tenancy_probes` scaffolding per that model's own
 * doc comment ("safe to delete once a real school-owned table exists to
 * carry the isolation test suite instead"). Deliberately queries WITHOUT a
 * school_id filter — the point of ADR-0023's defence-in-depth is that RLS
 * still blocks the read even when application code forgets to scope it.
 *
 * Two connections, deliberately: fixture setup/teardown runs as the
 * schema-owner role (DATABASE_URL_TEST) so it isn't itself subject to RLS;
 * every assertion below runs as the actual application role
 * (DATABASE_APP_URL_TEST, see infra/postgres/init.sql) — a Postgres
 * superuser bypasses RLS unconditionally, so testing against the owner
 * connection would pass without RLS doing anything at all.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, withTenant, type PrismaClient } from '@atlas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../support/run-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST;
const appDatabaseUrl = process.env.DATABASE_APP_URL_TEST;

describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation (ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let userA: { id: string };
    let userB: { id: string };
    let membershipA: { id: string };
    let membershipB: { id: string };

    beforeAll(async () => {
      // Deploy is idempotent (a no-op if already applied) and cheap — this
      // makes the file self-sufficient regardless of what other
      // integration test files against the same database ran, or reset,
      // before it (see migrations.integration.test.ts, which deliberately
      // ends by resetting the schema to empty).
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);

      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: { name: `RLS Test School A ${randomUUID()}`, subdomain: `rls-a-${Date.now()}` },
      });
      schoolB = await owner.school.create({
        data: { name: `RLS Test School B ${randomUUID()}`, subdomain: `rls-b-${Date.now()}` },
      });

      userA = await owner.user.create({
        data: { firstName: 'A', lastName: 'Person', displayName: 'A Person' },
      });
      userB = await owner.user.create({
        data: { firstName: 'B', lastName: 'Person', displayName: 'B Person' },
      });

      membershipA = await owner.schoolMembership.create({
        data: { schoolId: schoolA.id, userId: userA.id, loginIdentifier: `rls-a-${Date.now()}` },
      });
      membershipB = await owner.schoolMembership.create({
        data: { schoolId: schoolB.id, userId: userB.id, loginIdentifier: `rls-b-${Date.now()}` },
      });
    });

    afterAll(async () => {
      await owner.schoolMembership.deleteMany({
        where: { schoolId: { in: [schoolA.id, schoolB.id] } },
      });
      await owner.user.deleteMany({
        where: { id: { in: [userA?.id, userB?.id].filter((id): id is string => Boolean(id)) } },
      });
      await owner.school.deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } });
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      // No withTenant() wrapper — session variable is unset. FORCE ROW LEVEL
      // SECURITY means even the owning role sees nothing — proven here
      // against the app role, the connection that actually matters.
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM school_memberships WHERE id IN (${membershipA.id}::uuid, ${membershipB.id}::uuid)`;
      expect(rows).toHaveLength(0);
    });

    it("scoped to school A, only school A's membership is visible — school B's is not", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM school_memberships WHERE id IN (${membershipA.id}::uuid, ${membershipB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it("scoped to school B, only school B's membership is visible", async () => {
      const rows = await withTenant(
        app,
        schoolB.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM school_memberships WHERE id IN (${membershipA.id}::uuid, ${membershipB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolB.id);
    });

    it('an explicit cross-tenant read by id returns nothing, even by primary key', async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM school_memberships WHERE id = ${membershipB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);

/**
 * B2's own new school-owned table (audit_events) — ADR-0023 requires the
 * same proof for every school-owned table, not just the one B1 already
 * covers above. `schoolId` here is the *affected* school (ADR-0012), which
 * is exactly why this table's isolation matters just as much: a break-
 * glass event written under School B's tenant context must never be
 * readable by School A.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — audit_events (B2, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let actor: { id: string };
    let eventA: { id: string };
    let eventB: { id: string };

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: {
          name: `Audit RLS School A ${randomUUID()}`,
          subdomain: `audit-rls-a-${Date.now()}`,
        },
      });
      schoolB = await owner.school.create({
        data: {
          name: `Audit RLS School B ${randomUUID()}`,
          subdomain: `audit-rls-b-${Date.now()}`,
        },
      });
      actor = await owner.user.create({
        data: { firstName: 'Audit', lastName: 'Actor', displayName: 'Audit Actor' },
      });

      eventA = await withTenant(owner, schoolA.id, (tx) =>
        tx.auditEvent.create({
          data: {
            schoolId: schoolA.id,
            actorUserId: actor.id,
            actorRole: 'SOFTWARE_ADMIN',
            action: 'TEST_EVENT_A',
          },
        }),
      );
      eventB = await withTenant(owner, schoolB.id, (tx) =>
        tx.auditEvent.create({
          data: {
            schoolId: schoolB.id,
            actorUserId: actor.id,
            actorRole: 'SOFTWARE_ADMIN',
            action: 'TEST_EVENT_B',
          },
        }),
      );
    });

    afterAll(async () => {
      // B10 gap closure: audit_events gained an unconditional append-only
      // trigger this phase (blocking UPDATE/DELETE for every role,
      // including the schema owner) — this block's own two fixture rows
      // are therefore genuinely, permanently undeletable, and so, by the
      // Cascade FK from audit_events to schools, is the school.deleteMany
      // below. Same best-effort treatment every other affected file in
      // this codebase already got (see safe-delete-schools.ts's own doc
      // comment) — this block predates that sweep and was missed by it,
      // since B10's *own* dedicated audit_events block (further down this
      // file) was added new rather than found by grepping existing ones.
      await owner.auditEvent
        .deleteMany({ where: { schoolId: { in: [schoolA.id, schoolB.id] } } })
        .catch(() => undefined);
      await owner.user.delete({ where: { id: actor.id } });
      await owner.school
        .deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } })
        .catch(() => undefined);
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM audit_events WHERE id IN (${eventA.id}::uuid, ${eventB.id}::uuid)`;
      expect(rows).toHaveLength(0);
    });

    it("scoped to school A, only school A's audit event is visible — school B's is not, even by primary key", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ action: string }>
          >`SELECT action FROM audit_events WHERE id IN (${eventA.id}::uuid, ${eventB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('TEST_EVENT_A');
    });

    it('a break-glass event visible to School B is still invisible to School A (cross-tenant, not actor-tenant, is what governs visibility)', async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM audit_events WHERE id = ${eventB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);

/**
 * B3's new school-owned tables (Subscription, ActivationGrant) — same
 * four-test shape as the audit_events block above.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — subscriptions & activation_grants (B3, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let issuer: { id: string };
    let subA: { id: string };
    let subB: { id: string };
    let grantA: { id: string };
    let grantB: { id: string };

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: { name: `Sub RLS School A ${randomUUID()}`, subdomain: `sub-rls-a-${Date.now()}` },
      });
      schoolB = await owner.school.create({
        data: { name: `Sub RLS School B ${randomUUID()}`, subdomain: `sub-rls-b-${Date.now()}` },
      });
      issuer = await owner.user.create({
        data: { firstName: 'Issuer', lastName: 'Admin', displayName: 'Issuer Admin' },
      });

      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      subA = await withTenant(owner, schoolA.id, (tx) =>
        tx.subscription.create({
          data: { schoolId: schoolA.id, plan: 'STANDARD', startAt: now, expiresAt: in30Days },
        }),
      );
      subB = await withTenant(owner, schoolB.id, (tx) =>
        tx.subscription.create({
          data: { schoolId: schoolB.id, plan: 'STANDARD', startAt: now, expiresAt: in30Days },
        }),
      );

      grantA = await withTenant(owner, schoolA.id, (tx) =>
        tx.activationGrant.create({
          data: {
            schoolId: schoolA.id,
            subscriptionId: subA.id,
            purpose: 'INITIAL_ACTIVATION',
            keyHash: `hash-a-${randomUUID()}`,
            issuedBy: issuer.id,
            expiresAt: in30Days,
          },
        }),
      );
      grantB = await withTenant(owner, schoolB.id, (tx) =>
        tx.activationGrant.create({
          data: {
            schoolId: schoolB.id,
            subscriptionId: subB.id,
            purpose: 'INITIAL_ACTIVATION',
            keyHash: `hash-b-${randomUUID()}`,
            issuedBy: issuer.id,
            expiresAt: in30Days,
          },
        }),
      );
    });

    afterAll(async () => {
      await owner.activationGrant.deleteMany({
        where: { schoolId: { in: [schoolA.id, schoolB.id] } },
      });
      await owner.subscription.deleteMany({
        where: { schoolId: { in: [schoolA.id, schoolB.id] } },
      });
      await owner.user.delete({ where: { id: issuer.id } });
      await owner.school.deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } });
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('subscriptions: with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM subscriptions WHERE id IN (${subA.id}::uuid, ${subB.id}::uuid)`;
      expect(rows).toHaveLength(0);
    });

    it("subscriptions: scoped to school A, only school A's subscription is visible", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM subscriptions WHERE id IN (${subA.id}::uuid, ${subB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it('subscriptions: an explicit cross-tenant read by id returns nothing, even by primary key', async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM subscriptions WHERE id = ${subB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('activation_grants: with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM activation_grants WHERE id IN (${grantA.id}::uuid, ${grantB.id}::uuid)`;
      expect(rows).toHaveLength(0);
    });

    it("activation_grants: scoped to school A, only school A's grant is visible", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM activation_grants WHERE id IN (${grantA.id}::uuid, ${grantB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it('activation_grants: an explicit cross-tenant read by id returns nothing, even by primary key (the ACTIVATION_KEY_INVALID enumeration-resistance case)', async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM activation_grants WHERE id = ${grantB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);

/**
 * B4's new school-owned table (MediaAsset) — same four-test shape as the
 * blocks above. This is also the mechanism `MediaService`'s own cross-
 * school-404 behaviour depends on for real (`.../complete`, `GET
 * /v1/media/:id/url`): a cross-school lookup via `withTenant` returns
 * `null`, not a 403 — RLS itself is what makes another school's row
 * genuinely invisible, not an application-level ownership check.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — media_assets (B4, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let uploader: { id: string };
    let assetA: { id: string };
    let assetB: { id: string };

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: {
          name: `Media RLS School A ${randomUUID()}`,
          subdomain: `media-rls-a-${Date.now()}`,
        },
      });
      schoolB = await owner.school.create({
        data: {
          name: `Media RLS School B ${randomUUID()}`,
          subdomain: `media-rls-b-${Date.now()}`,
        },
      });
      uploader = await owner.user.create({
        data: { firstName: 'Media', lastName: 'Uploader', displayName: 'Media Uploader' },
      });

      const now = new Date();
      const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000);

      assetA = await withTenant(owner, schoolA.id, (tx) =>
        tx.mediaAsset.create({
          data: {
            id: randomUUID(),
            schoolId: schoolA.id,
            type: 'QUESTION_IMAGE',
            storageKey: `schools/${schoolA.id}/questions/${randomUUID()}/a.png`,
            originalFilename: 'a.png',
            declaredMimeType: 'image/png',
            declaredSizeBytes: 1024,
            uploaderUserId: uploader.id,
            uploadUrlExpiresAt: in15Minutes,
          },
        }),
      );
      assetB = await withTenant(owner, schoolB.id, (tx) =>
        tx.mediaAsset.create({
          data: {
            id: randomUUID(),
            schoolId: schoolB.id,
            type: 'QUESTION_IMAGE',
            storageKey: `schools/${schoolB.id}/questions/${randomUUID()}/b.png`,
            originalFilename: 'b.png',
            declaredMimeType: 'image/png',
            declaredSizeBytes: 1024,
            uploaderUserId: uploader.id,
            uploadUrlExpiresAt: in15Minutes,
          },
        }),
      );
    });

    afterAll(async () => {
      await owner.mediaAsset.deleteMany({ where: { schoolId: { in: [schoolA.id, schoolB.id] } } });
      await owner.user.delete({ where: { id: uploader.id } });
      await owner.school.deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } });
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM media_assets WHERE id IN (${assetA.id}::uuid, ${assetB.id}::uuid)`;
      expect(rows).toHaveLength(0);
    });

    it("scoped to school A, only school A's asset is visible", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM media_assets WHERE id IN (${assetA.id}::uuid, ${assetB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it("scoped to school B, only school B's asset is visible", async () => {
      const rows = await withTenant(
        app,
        schoolB.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string }>
          >`SELECT school_id FROM media_assets WHERE id IN (${assetA.id}::uuid, ${assetB.id}::uuid)`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolB.id);
    });

    it("an explicit cross-tenant read by id returns nothing, even by primary key (MediaService.getSignedUrl's actual 404 mechanism)", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM media_assets WHERE id = ${assetB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);

/**
 * B5's seven new school-owned tables (AcademicSession, AcademicTerm,
 * Department, ClassGroup, Subject, ClassSubject, HODAssignment) plus B6's
 * three (StudentEnrollment, TeacherAssignment, StudentSubjectRegistration,
 * added to this same block per B3/B4/B5's own "economy" precedent rather
 * than a new describe block) — same three-test shape as the B3/B4 blocks
 * above (no-context-blocks-all, scoped-visible, cross-tenant-by-id-blocked),
 * run once per table. One fixture chain per school (session -> term,
 * department -> class -> offering, membership+department -> HOD assignment,
 * membership -> student/teacher profile -> enrollment/assignment ->
 * registration) so every FK in the chain is exercised, not just the leaf
 * table.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — academic structure (B5/B6, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let userA: { id: string };
    let userB: { id: string };
    let sessionA: { id: string };
    let sessionB: { id: string };
    let termA: { id: string };
    let termB: { id: string };
    let deptA: { id: string };
    let deptB: { id: string };
    let classA: { id: string };
    let classB: { id: string };
    let subjectA: { id: string };
    let subjectB: { id: string };
    let classSubjectA: { id: string };
    let classSubjectB: { id: string };
    let hodAssignmentA: { id: string };
    let hodAssignmentB: { id: string };
    let studentProfileA: { id: string };
    let studentProfileB: { id: string };
    let teacherProfileA: { id: string };
    let teacherProfileB: { id: string };
    let studentEnrollmentA: { id: string };
    let studentEnrollmentB: { id: string };
    let teacherAssignmentA: { id: string };
    let teacherAssignmentB: { id: string };
    let studentSubjectRegistrationA: { id: string };
    let studentSubjectRegistrationB: { id: string };
    let importJobA: { id: string };
    let importJobB: { id: string };
    let importRowA: { id: string };
    let importRowB: { id: string };
    let topicA: { id: string };
    let topicB: { id: string };
    let questionA: { id: string };
    let questionB: { id: string };
    let questionRevisionA: { id: string };
    let questionRevisionB: { id: string };
    let questionOptionA: { id: string };
    let questionOptionB: { id: string };
    let questionMediaAssetA: { id: string };
    let questionMediaAssetB: { id: string };
    let questionMediaA: { id: string };
    let questionMediaB: { id: string };
    let questionReviewA: { id: string };
    let questionReviewB: { id: string };
    // B10's new table — no immutability trigger (status/readAt are
    // legitimately mutable), so it needs no special afterAll accommodation
    // beyond this block's existing .catch(() => undefined) convention.
    let notificationA: { id: string };
    let notificationB: { id: string };

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: {
          name: `Academics RLS School A ${randomUUID()}`,
          subdomain: `acad-rls-a-${Date.now()}`,
        },
      });
      schoolB = await owner.school.create({
        data: {
          name: `Academics RLS School B ${randomUUID()}`,
          subdomain: `acad-rls-b-${Date.now()}`,
        },
      });

      userA = await owner.user.create({
        data: { firstName: 'Hod', lastName: 'A', displayName: 'Hod A' },
      });
      userB = await owner.user.create({
        data: { firstName: 'Hod', lastName: 'B', displayName: 'Hod B' },
      });
      const membershipA = await withTenant(owner, schoolA.id, (tx) =>
        tx.schoolMembership.create({
          data: { schoolId: schoolA.id, userId: userA.id, loginIdentifier: `hod-a-${Date.now()}` },
        }),
      );
      const membershipB = await withTenant(owner, schoolB.id, (tx) =>
        tx.schoolMembership.create({
          data: { schoolId: schoolB.id, userId: userB.id, loginIdentifier: `hod-b-${Date.now()}` },
        }),
      );
      await withTenant(owner, schoolA.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: schoolA.id, membershipId: membershipA.id, role: 'HOD' },
        }),
      );
      await withTenant(owner, schoolB.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: schoolB.id, membershipId: membershipB.id, role: 'HOD' },
        }),
      );

      const start = new Date('2026-09-01');
      const end = new Date('2027-07-31');

      sessionA = await withTenant(owner, schoolA.id, (tx) =>
        tx.academicSession.create({
          data: {
            schoolId: schoolA.id,
            name: `RLS-A-${randomUUID().slice(0, 8)}`,
            startDate: start,
            endDate: end,
          },
        }),
      );
      sessionB = await withTenant(owner, schoolB.id, (tx) =>
        tx.academicSession.create({
          data: {
            schoolId: schoolB.id,
            name: `RLS-B-${randomUUID().slice(0, 8)}`,
            startDate: start,
            endDate: end,
          },
        }),
      );
      termA = await withTenant(owner, schoolA.id, (tx) =>
        tx.academicTerm.create({
          data: {
            schoolId: schoolA.id,
            academicSessionId: sessionA.id,
            name: 'First Term',
            sequence: 1,
            startDate: start,
            endDate: end,
          },
        }),
      );
      termB = await withTenant(owner, schoolB.id, (tx) =>
        tx.academicTerm.create({
          data: {
            schoolId: schoolB.id,
            academicSessionId: sessionB.id,
            name: 'First Term',
            sequence: 1,
            startDate: start,
            endDate: end,
          },
        }),
      );
      deptA = await withTenant(owner, schoolA.id, (tx) =>
        tx.department.create({
          data: {
            schoolId: schoolA.id,
            name: 'Science',
            code: `SCI-A-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      deptB = await withTenant(owner, schoolB.id, (tx) =>
        tx.department.create({
          data: {
            schoolId: schoolB.id,
            name: 'Science',
            code: `SCI-B-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      classA = await withTenant(owner, schoolA.id, (tx) =>
        tx.classGroup.create({
          data: {
            schoolId: schoolA.id,
            academicSessionId: sessionA.id,
            departmentId: deptA.id,
            name: 'SS2A',
            level: 'SS2',
            arm: 'A',
          },
        }),
      );
      classB = await withTenant(owner, schoolB.id, (tx) =>
        tx.classGroup.create({
          data: {
            schoolId: schoolB.id,
            academicSessionId: sessionB.id,
            departmentId: deptB.id,
            name: 'SS2A',
            level: 'SS2',
            arm: 'A',
          },
        }),
      );
      subjectA = await withTenant(owner, schoolA.id, (tx) =>
        tx.subject.create({
          data: {
            schoolId: schoolA.id,
            name: 'Mathematics',
            code: `MTH-A-${randomUUID().slice(0, 6)}`,
            departmentId: deptA.id,
          },
        }),
      );
      subjectB = await withTenant(owner, schoolB.id, (tx) =>
        tx.subject.create({
          data: {
            schoolId: schoolB.id,
            name: 'Mathematics',
            code: `MTH-B-${randomUUID().slice(0, 6)}`,
            departmentId: deptB.id,
          },
        }),
      );
      classSubjectA = await withTenant(owner, schoolA.id, (tx) =>
        tx.classSubject.create({
          data: {
            schoolId: schoolA.id,
            classId: classA.id,
            subjectId: subjectA.id,
            academicSessionId: sessionA.id,
          },
        }),
      );
      classSubjectB = await withTenant(owner, schoolB.id, (tx) =>
        tx.classSubject.create({
          data: {
            schoolId: schoolB.id,
            classId: classB.id,
            subjectId: subjectB.id,
            academicSessionId: sessionB.id,
          },
        }),
      );
      hodAssignmentA = await withTenant(owner, schoolA.id, (tx) =>
        tx.hODAssignment.create({
          data: {
            schoolId: schoolA.id,
            membershipId: membershipA.id,
            departmentId: deptA.id,
            academicSessionId: sessionA.id,
            startDate: start,
          },
        }),
      );
      hodAssignmentB = await withTenant(owner, schoolB.id, (tx) =>
        tx.hODAssignment.create({
          data: {
            schoolId: schoolB.id,
            membershipId: membershipB.id,
            departmentId: deptB.id,
            academicSessionId: sessionB.id,
            startDate: start,
          },
        }),
      );

      // B6's three new tables — reuses membershipA/B (already RLS-scoped,
      // no new users/memberships needed for a pure tenant-isolation check).
      studentProfileA = await withTenant(owner, schoolA.id, (tx) =>
        tx.studentProfile.create({
          data: {
            schoolId: schoolA.id,
            membershipId: membershipA.id,
            studentId: `ST-A-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      studentProfileB = await withTenant(owner, schoolB.id, (tx) =>
        tx.studentProfile.create({
          data: {
            schoolId: schoolB.id,
            membershipId: membershipB.id,
            studentId: `ST-B-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      teacherProfileA = await withTenant(owner, schoolA.id, (tx) =>
        tx.teacherProfile.create({
          data: {
            schoolId: schoolA.id,
            membershipId: membershipA.id,
            staffId: `STF-A-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      teacherProfileB = await withTenant(owner, schoolB.id, (tx) =>
        tx.teacherProfile.create({
          data: {
            schoolId: schoolB.id,
            membershipId: membershipB.id,
            staffId: `STF-B-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      studentEnrollmentA = await withTenant(owner, schoolA.id, (tx) =>
        tx.studentEnrollment.create({
          data: {
            schoolId: schoolA.id,
            studentProfileId: studentProfileA.id,
            academicSessionId: sessionA.id,
            classId: classA.id,
            startDate: start,
          },
        }),
      );
      studentEnrollmentB = await withTenant(owner, schoolB.id, (tx) =>
        tx.studentEnrollment.create({
          data: {
            schoolId: schoolB.id,
            studentProfileId: studentProfileB.id,
            academicSessionId: sessionB.id,
            classId: classB.id,
            startDate: start,
          },
        }),
      );
      teacherAssignmentA = await withTenant(owner, schoolA.id, (tx) =>
        tx.teacherAssignment.create({
          data: {
            schoolId: schoolA.id,
            teacherProfileId: teacherProfileA.id,
            classSubjectId: classSubjectA.id,
            academicSessionId: sessionA.id,
            startDate: start,
          },
        }),
      );
      teacherAssignmentB = await withTenant(owner, schoolB.id, (tx) =>
        tx.teacherAssignment.create({
          data: {
            schoolId: schoolB.id,
            teacherProfileId: teacherProfileB.id,
            classSubjectId: classSubjectB.id,
            academicSessionId: sessionB.id,
            startDate: start,
          },
        }),
      );
      studentSubjectRegistrationA = await withTenant(owner, schoolA.id, (tx) =>
        tx.studentSubjectRegistration.create({
          data: {
            schoolId: schoolA.id,
            studentEnrollmentId: studentEnrollmentA.id,
            classSubjectId: classSubjectA.id,
          },
        }),
      );
      studentSubjectRegistrationB = await withTenant(owner, schoolB.id, (tx) =>
        tx.studentSubjectRegistration.create({
          data: {
            schoolId: schoolB.id,
            studentEnrollmentId: studentEnrollmentB.id,
            classSubjectId: classSubjectB.id,
          },
        }),
      );

      // B7's two new tables — same economy as B3/B4/B5/B6's own precedent:
      // reusing this describe block's single fixture school pair.
      // sourceMediaAssetId has no enforced FK (a plain scalar column, per
      // ImportJob's own schema comment) — any UUID is fine here.
      importJobA = await withTenant(owner, schoolA.id, (tx) =>
        tx.importJob.create({
          data: {
            schoolId: schoolA.id,
            type: 'TEACHERS',
            status: 'VALIDATED',
            sourceMediaAssetId: randomUUID(),
            uploaderUserId: userA.id,
            uploaderRole: 'SCHOOL_ADMIN',
            templateVersion: 1,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        }),
      );
      importJobB = await withTenant(owner, schoolB.id, (tx) =>
        tx.importJob.create({
          data: {
            schoolId: schoolB.id,
            type: 'TEACHERS',
            status: 'VALIDATED',
            sourceMediaAssetId: randomUUID(),
            uploaderUserId: userB.id,
            uploaderRole: 'SCHOOL_ADMIN',
            templateVersion: 1,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        }),
      );
      importRowA = await withTenant(owner, schoolA.id, (tx) =>
        tx.importRow.create({
          data: {
            schoolId: schoolA.id,
            importJobId: importJobA.id,
            rowNumber: 1,
            rawData: { 'Staff ID': 'RLS-A' },
            status: 'VALID',
          },
        }),
      );
      importRowB = await withTenant(owner, schoolB.id, (tx) =>
        tx.importRow.create({
          data: {
            schoolId: schoolB.id,
            importJobId: importJobB.id,
            rowNumber: 1,
            rawData: { 'Staff ID': 'RLS-B' },
            status: 'VALID',
          },
        }),
      );

      // B8's five new tables — same economy as B3-B7's own precedent,
      // reusing subjectA/B and teacherProfileA/B rather than a new
      // fixture school pair. Kept at DRAFT status throughout — RLS
      // isolation is what's under test here, not the immutability
      // trigger (proven separately in question-lifecycle.integration
      // .test.ts), and an APPROVED row would make afterAll's cleanup
      // fight that trigger for no reason.
      topicA = await withTenant(owner, schoolA.id, (tx) =>
        tx.topic.create({
          data: { schoolId: schoolA.id, subjectId: subjectA.id, name: 'RLS Topic A' },
        }),
      );
      topicB = await withTenant(owner, schoolB.id, (tx) =>
        tx.topic.create({
          data: { schoolId: schoolB.id, subjectId: subjectB.id, name: 'RLS Topic B' },
        }),
      );
      questionA = await withTenant(owner, schoolA.id, (tx) =>
        tx.question.create({
          data: {
            schoolId: schoolA.id,
            subjectId: subjectA.id,
            level: 'SS2',
            authorTeacherProfileId: teacherProfileA.id,
          },
        }),
      );
      questionB = await withTenant(owner, schoolB.id, (tx) =>
        tx.question.create({
          data: {
            schoolId: schoolB.id,
            subjectId: subjectB.id,
            level: 'SS2',
            authorTeacherProfileId: teacherProfileB.id,
          },
        }),
      );
      questionRevisionA = await withTenant(owner, schoolA.id, (tx) =>
        tx.questionRevision.create({
          data: {
            schoolId: schoolA.id,
            questionId: questionA.id,
            revisionNumber: 1,
            questionType: 'SINGLE_CHOICE',
            content: 'RLS question A',
            topicId: topicA.id,
            difficulty: 'EASY',
            marks: 1,
            createdByMembershipId: membershipA.id,
            status: 'DRAFT',
          },
        }),
      );
      questionRevisionB = await withTenant(owner, schoolB.id, (tx) =>
        tx.questionRevision.create({
          data: {
            schoolId: schoolB.id,
            questionId: questionB.id,
            revisionNumber: 1,
            questionType: 'SINGLE_CHOICE',
            content: 'RLS question B',
            topicId: topicB.id,
            difficulty: 'EASY',
            marks: 1,
            createdByMembershipId: membershipB.id,
            status: 'DRAFT',
          },
        }),
      );
      await withTenant(owner, schoolA.id, (tx) =>
        tx.question.update({
          where: { id: questionA.id },
          data: { currentRevisionId: questionRevisionA.id },
        }),
      );
      await withTenant(owner, schoolB.id, (tx) =>
        tx.question.update({
          where: { id: questionB.id },
          data: { currentRevisionId: questionRevisionB.id },
        }),
      );
      questionOptionA = await withTenant(owner, schoolA.id, (tx) =>
        tx.questionOption.create({
          data: {
            schoolId: schoolA.id,
            questionRevisionId: questionRevisionA.id,
            content: 'A',
            originalOrder: 0,
            correctFlag: true,
          },
        }),
      );
      questionOptionB = await withTenant(owner, schoolB.id, (tx) =>
        tx.questionOption.create({
          data: {
            schoolId: schoolB.id,
            questionRevisionId: questionRevisionB.id,
            content: 'B',
            originalOrder: 0,
            correctFlag: true,
          },
        }),
      );
      questionMediaAssetA = await withTenant(owner, schoolA.id, (tx) =>
        tx.mediaAsset.create({
          data: {
            id: randomUUID(),
            schoolId: schoolA.id,
            type: 'QUESTION_IMAGE',
            storageKey: `schools/${schoolA.id}/questions/${randomUUID()}/rls-a.png`,
            originalFilename: 'rls-a.png',
            declaredMimeType: 'image/png',
            declaredSizeBytes: 1024,
            uploaderUserId: userA.id,
            uploadUrlExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        }),
      );
      questionMediaAssetB = await withTenant(owner, schoolB.id, (tx) =>
        tx.mediaAsset.create({
          data: {
            id: randomUUID(),
            schoolId: schoolB.id,
            type: 'QUESTION_IMAGE',
            storageKey: `schools/${schoolB.id}/questions/${randomUUID()}/rls-b.png`,
            originalFilename: 'rls-b.png',
            declaredMimeType: 'image/png',
            declaredSizeBytes: 1024,
            uploaderUserId: userB.id,
            uploadUrlExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        }),
      );
      questionMediaA = await withTenant(owner, schoolA.id, (tx) =>
        tx.questionMedia.create({
          data: {
            schoolId: schoolA.id,
            questionRevisionId: questionRevisionA.id,
            mediaAssetId: questionMediaAssetA.id,
            displayOrder: 0,
          },
        }),
      );
      questionMediaB = await withTenant(owner, schoolB.id, (tx) =>
        tx.questionMedia.create({
          data: {
            schoolId: schoolB.id,
            questionRevisionId: questionRevisionB.id,
            mediaAssetId: questionMediaAssetB.id,
            displayOrder: 0,
          },
        }),
      );
      // B9's new table — reuses this describe block's own membershipA/B
      // (already RLS-scoped, and each already holds an HOD RoleAssignment
      // from this same fixture set) as the reviewer, same economy as B6/B7.
      questionReviewA = await withTenant(owner, schoolA.id, (tx) =>
        tx.questionReview.create({
          data: {
            schoolId: schoolA.id,
            questionRevisionId: questionRevisionA.id,
            reviewerMembershipId: membershipA.id,
            decision: 'REJECTED',
            comment: 'RLS review A',
          },
        }),
      );
      questionReviewB = await withTenant(owner, schoolB.id, (tx) =>
        tx.questionReview.create({
          data: {
            schoolId: schoolB.id,
            questionRevisionId: questionRevisionB.id,
            reviewerMembershipId: membershipB.id,
            decision: 'REJECTED',
            comment: 'RLS review B',
          },
        }),
      );
      // B10's new table — reuses this block's own userA/B as recipient,
      // same economy as every other table added here since B6.
      notificationA = await withTenant(owner, schoolA.id, (tx) =>
        tx.notification.create({
          data: {
            schoolId: schoolA.id,
            recipientUserId: userA.id,
            type: 'SUBSCRIPTION_EXPIRING',
            title: 'RLS notification A',
            content: 'RLS notification A',
          },
        }),
      );
      notificationB = await withTenant(owner, schoolB.id, (tx) =>
        tx.notification.create({
          data: {
            schoolId: schoolB.id,
            recipientUserId: userB.id,
            type: 'SUBSCRIPTION_EXPIRING',
            title: 'RLS notification B',
            content: 'RLS notification B',
          },
        }),
      );
    });

    afterAll(async () => {
      const ids = [schoolA.id, schoolB.id];
      // B9: question_reviews is unconditionally append-only (this
      // migration's trigger blocks every UPDATE/DELETE, not merely once a
      // parent is APPROVED like B8's own three triggers) — questionReviewA/B
      // are therefore genuinely, permanently undeletable, and so, by the
      // Restrict FK from question_reviews to question_revisions, is
      // everything from Question downward that this test's own cascade
      // chain would otherwise need to pass through. Same reasoning as
      // question-lifecycle.integration.test.ts's own afterAll for its
      // APPROVED-revision case: cleanup can't fight the guarantee it exists
      // to prove, so every step below is best-effort — the leftover test
      // data is harmless (RLS-scoped, uniquely UUID-named, never reachable
      // outside this deleted school's own context).
      // B10: notification has no immutability trigger (status/readAt are
      // legitimately mutable) — deleted explicitly here anyway, matching
      // this block's existing explicit-per-table convention.
      await owner.notification
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.questionReview
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.question.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.topic.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.mediaAsset
        .deleteMany({ where: { id: { in: [questionMediaAssetA.id, questionMediaAssetB.id] } } })
        .catch(() => undefined);
      await owner.importRow.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.importJob.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.studentSubjectRegistration
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.teacherAssignment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.studentEnrollment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.studentProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.teacherProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.hODAssignment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.classSubject
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.classGroup
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.subject.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.department
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.academicTerm
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.academicSession
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.roleAssignment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.schoolMembership
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.user
        .deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
        .catch(() => undefined);
      await owner.school.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
      await owner.$disconnect();
      await app.$disconnect();
    });

    const tables: Array<{
      label: string;
      table: string;
      idA: () => string;
      idB: () => string;
    }> = [
      {
        label: 'academic_sessions',
        table: 'academic_sessions',
        idA: () => sessionA.id,
        idB: () => sessionB.id,
      },
      {
        label: 'academic_terms',
        table: 'academic_terms',
        idA: () => termA.id,
        idB: () => termB.id,
      },
      { label: 'departments', table: 'departments', idA: () => deptA.id, idB: () => deptB.id },
      { label: 'class_groups', table: 'class_groups', idA: () => classA.id, idB: () => classB.id },
      { label: 'subjects', table: 'subjects', idA: () => subjectA.id, idB: () => subjectB.id },
      {
        label: 'class_subjects',
        table: 'class_subjects',
        idA: () => classSubjectA.id,
        idB: () => classSubjectB.id,
      },
      {
        label: 'hod_assignments',
        table: 'hod_assignments',
        idA: () => hodAssignmentA.id,
        idB: () => hodAssignmentB.id,
      },
      // B6's three new tables — same economy as B3/B4/B5's own precedent:
      // reusing this describe block's single fixture school pair rather
      // than a whole new describe block.
      {
        label: 'student_enrollments',
        table: 'student_enrollments',
        idA: () => studentEnrollmentA.id,
        idB: () => studentEnrollmentB.id,
      },
      {
        label: 'teacher_assignments',
        table: 'teacher_assignments',
        idA: () => teacherAssignmentA.id,
        idB: () => teacherAssignmentB.id,
      },
      {
        label: 'student_subject_registrations',
        table: 'student_subject_registrations',
        idA: () => studentSubjectRegistrationA.id,
        idB: () => studentSubjectRegistrationB.id,
      },
      // B7's two new tables — same economy as B3/B4/B5/B6's own precedent.
      {
        label: 'import_jobs',
        table: 'import_jobs',
        idA: () => importJobA.id,
        idB: () => importJobB.id,
      },
      {
        label: 'import_rows',
        table: 'import_rows',
        idA: () => importRowA.id,
        idB: () => importRowB.id,
      },
      // B8's five new tables — same economy as B3-B7's own precedent.
      { label: 'topics', table: 'topics', idA: () => topicA.id, idB: () => topicB.id },
      { label: 'questions', table: 'questions', idA: () => questionA.id, idB: () => questionB.id },
      {
        label: 'question_revisions',
        table: 'question_revisions',
        idA: () => questionRevisionA.id,
        idB: () => questionRevisionB.id,
      },
      {
        label: 'question_options',
        table: 'question_options',
        idA: () => questionOptionA.id,
        idB: () => questionOptionB.id,
      },
      {
        label: 'question_media',
        table: 'question_media',
        idA: () => questionMediaA.id,
        idB: () => questionMediaB.id,
      },
      // B9's new table — same economy as B3-B8's own precedent.
      {
        label: 'question_reviews',
        table: 'question_reviews',
        idA: () => questionReviewA.id,
        idB: () => questionReviewB.id,
      },
      // B10's new table — same economy as B3-B9's own precedent.
      {
        label: 'notifications',
        table: 'notifications',
        idA: () => notificationA.id,
        idB: () => notificationB.id,
      },
    ];

    it.each(tables)(
      '$label: with no tenant context set, RLS blocks all rows (fails closed)',
      async ({ table, idA, idB }) => {
        const rows = await app.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
          idA(),
          idB(),
        );
        expect(rows).toHaveLength(0);
      },
    );

    it.each(tables)(
      "$label: scoped to school A, only school A's row is visible",
      async ({ table, idA, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ school_id: string }>>(
            `SELECT school_id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
            idA(),
            idB(),
          ),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.school_id).toBe(schoolA.id);
      },
    );

    it.each(tables)(
      '$label: an explicit cross-tenant read by id returns nothing, even by primary key',
      async ({ table, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM ${table} WHERE id = $1::uuid`,
            idB(),
          ),
        );
        expect(rows).toHaveLength(0);
      },
    );
  },
);

/**
 * B11's four new tables (Exam, ExamClass, ExamSection, ExamQuestion) — a
 * deliberately SEPARATE describe block, not appended to the shared B5-B9
 * block above, for a real reason rather than an oversight: `exam_questions`
 * requires its bound `question_revisions` row to be APPROVED (this
 * migration's own trigger), and that block's own DRAFT-only fixture design
 * exists specifically "so an APPROVED row would make afterAll's cleanup
 * fight that trigger for no reason" (see its own comment). Introducing an
 * APPROVED revision into that block's shared `owner.question.deleteMany
 * ({where:{schoolId:{in:ids}}})` batch would make the ENTIRE statement fail
 * (a Postgres multi-row DELETE is one atomic statement — one blocked row
 * aborts all of it), silently regressing the cleanup of every other
 * already-passing row in that block, not just this phase's own addition.
 * A dedicated school pair — mirroring the B3/B4 blocks' own shape exactly —
 * avoids that regression entirely: this block's own best-effort cleanup
 * only ever affects its own two schools.
 *
 * B12's four new tables (ExamSession, ExamSessionParticipant,
 * ExamParticipation, ExamAdministrator) extend this same block rather than
 * getting a dedicated one of their own — unlike B10's `audit_events`, none
 * of them carry a delete-blocking trigger (B12's own
 * `exam_sessions_status_transition_guard` only fires `BEFORE UPDATE OF
 * status`, never on DELETE), so there is no analogous "shared cleanup
 * fights an immutability trigger" risk to avoid — this fixture pair's own
 * already-APPROVED question is the only thing that needed isolating, and
 * that isolation already exists here.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — exams, exam_classes, exam_sections, exam_questions, exam_sessions, exam_session_participants, exam_participations, exam_administrators (B11/B12, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let examA: { id: string };
    let examB: { id: string };
    let examClassA: { id: string };
    let examClassB: { id: string };
    let examSectionA: { id: string };
    let examSectionB: { id: string };
    let examQuestionA: { id: string };
    let examQuestionB: { id: string };
    let examSessionA: { id: string };
    let examSessionB: { id: string };
    let examSessionParticipantA: { id: string };
    let examSessionParticipantB: { id: string };
    let examParticipationA: { id: string };
    let examParticipationB: { id: string };
    let examAdministratorA: { id: string };
    let examAdministratorB: { id: string };

    async function buildFixture(label: string) {
      const school = await owner.school.create({
        data: {
          name: `Exam RLS School ${label} ${randomUUID()}`,
          subdomain: `exam-rls-${label.toLowerCase()}-${Date.now()}`,
        },
      });
      const user = await owner.user.create({
        data: { firstName: 'Teacher', lastName: label, displayName: `Teacher ${label}` },
      });
      const membership = await withTenant(owner, school.id, (tx) =>
        tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            loginIdentifier: `exam-rls-${label.toLowerCase()}-${Date.now()}`,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: membership.id, role: 'TEACHER' },
        }),
      );
      const start = new Date('2026-09-01');
      const end = new Date('2027-07-31');
      const session = await withTenant(owner, school.id, (tx) =>
        tx.academicSession.create({
          data: {
            schoolId: school.id,
            name: `Exam-RLS-${label}-${randomUUID().slice(0, 8)}`,
            startDate: start,
            endDate: end,
          },
        }),
      );
      const term = await withTenant(owner, school.id, (tx) =>
        tx.academicTerm.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            name: 'First Term',
            sequence: 1,
            startDate: start,
            endDate: end,
          },
        }),
      );
      const classGroup = await withTenant(owner, school.id, (tx) =>
        tx.classGroup.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            name: 'SS2A',
            level: 'SS2',
            arm: 'A',
          },
        }),
      );
      const subject = await withTenant(owner, school.id, (tx) =>
        tx.subject.create({
          data: {
            schoolId: school.id,
            name: 'Mathematics',
            code: `MTH-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      const classSubject = await withTenant(owner, school.id, (tx) =>
        tx.classSubject.create({
          data: {
            schoolId: school.id,
            classId: classGroup.id,
            subjectId: subject.id,
            academicSessionId: session.id,
          },
        }),
      );
      const teacherProfile = await withTenant(owner, school.id, (tx) =>
        tx.teacherProfile.create({
          data: {
            schoolId: school.id,
            membershipId: membership.id,
            staffId: `STF-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      const question = await withTenant(owner, school.id, (tx) =>
        tx.question.create({
          data: {
            schoolId: school.id,
            subjectId: subject.id,
            level: 'SS2',
            authorTeacherProfileId: teacherProfile.id,
          },
        }),
      );
      const revision = await withTenant(owner, school.id, (tx) =>
        tx.questionRevision.create({
          data: {
            schoolId: school.id,
            questionId: question.id,
            revisionNumber: 1,
            questionType: 'SINGLE_CHOICE',
            content: `Exam RLS question ${label}`,
            difficulty: 'EASY',
            marks: 2,
            createdByMembershipId: membership.id,
            status: 'DRAFT',
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.question.update({
          where: { id: question.id },
          data: { currentRevisionId: revision.id },
        }),
      );
      // The one status transition INTO APPROVED — allowed, since OLD.status
      // is DRAFT at this point, not APPROVED (the trigger only blocks a
      // further mutation once already APPROVED).
      await withTenant(owner, school.id, (tx) =>
        tx.questionRevision.update({ where: { id: revision.id }, data: { status: 'APPROVED' } }),
      );

      const exam = await withTenant(owner, school.id, (tx) =>
        tx.exam.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            academicTermId: term.id,
            subjectId: subject.id,
            title: `Exam RLS ${label}`,
            examType: 'Mock Examination',
            durationSeconds: 3600,
            resultPolicy: 'TEACHER',
            resultDetailVisibility: 'SCORE_ONLY',
            createdByMembershipId: membership.id,
          },
        }),
      );
      const examSection = await withTenant(owner, school.id, (tx) =>
        tx.examSection.create({ data: { schoolId: school.id, examId: exam.id } }),
      );
      const examClass = await withTenant(owner, school.id, (tx) =>
        tx.examClass.create({
          data: { schoolId: school.id, examId: exam.id, classSubjectId: classSubject.id },
        }),
      );
      const examQuestion = await withTenant(owner, school.id, (tx) =>
        tx.examQuestion.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            examSectionId: examSection.id,
            questionRevisionId: revision.id,
            sequence: 1,
            marks: 2,
          },
        }),
      );

      // B12 fixtures — a minimal student profile (no real enrollment/
      // registration needed; RLS isolation doesn't depend on business-rule
      // validity, only that the row exists and is school-scoped, mirroring
      // exam_classes/exam_sections' own equally minimal shape above).
      const studentUser = await owner.user.create({
        data: { firstName: 'Student', lastName: label, displayName: `Student ${label}` },
      });
      const studentMembership = await withTenant(owner, school.id, (tx) =>
        tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: studentUser.id,
            loginIdentifier: `exam-rls-student-${label.toLowerCase()}-${Date.now()}`,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: studentMembership.id, role: 'STUDENT' },
        }),
      );
      const studentProfile = await withTenant(owner, school.id, (tx) =>
        tx.studentProfile.create({
          data: {
            schoolId: school.id,
            membershipId: studentMembership.id,
            studentId: `ST-RLS-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );

      const examSession = await withTenant(owner, school.id, (tx) =>
        tx.examSession.create({
          data: { schoolId: school.id, examId: exam.id, openedByMembershipId: membership.id },
        }),
      );
      const examSessionParticipant = await withTenant(owner, school.id, (tx) =>
        tx.examSessionParticipant.create({
          data: {
            schoolId: school.id,
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
          },
        }),
      );
      const examParticipation = await withTenant(owner, school.id, (tx) =>
        tx.examParticipation.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            // Required since B16 made participation session-scoped; this
            // fixture predated it (found when B20 ran the full typecheck).
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
            status: 'ABSENT',
            markedByMembershipId: membership.id,
          },
        }),
      );
      const examAdministrator = await withTenant(owner, school.id, (tx) =>
        tx.examAdministrator.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            membershipId: membership.id,
            assignedByMembershipId: membership.id,
          },
        }),
      );

      return {
        school,
        exam,
        examSection,
        examClass,
        examQuestion,
        examSession,
        examSessionParticipant,
        examParticipation,
        examAdministrator,
      };
    }

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      const a = await buildFixture('A');
      const b = await buildFixture('B');
      schoolA = a.school;
      schoolB = b.school;
      examA = a.exam;
      examB = b.exam;
      examSectionA = a.examSection;
      examSectionB = b.examSection;
      examClassA = a.examClass;
      examClassB = b.examClass;
      examQuestionA = a.examQuestion;
      examQuestionB = b.examQuestion;
      examSessionA = a.examSession;
      examSessionB = b.examSession;
      examSessionParticipantA = a.examSessionParticipant;
      examSessionParticipantB = b.examSessionParticipant;
      examParticipationA = a.examParticipation;
      examParticipationB = b.examParticipation;
      examAdministratorA = a.examAdministrator;
      examAdministratorB = b.examAdministrator;
    });

    afterAll(async () => {
      const ids = [schoolA.id, schoolB.id];
      // B12: ExamSession/ExamParticipation both use onDelete: Restrict
      // against Exam — must be deleted before it, unlike ExamQuestion/
      // ExamClass/ExamSection/ExamAdministrator, which cascade from it.
      await owner.examSessionParticipant
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.examParticipation
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.examSession
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // Exam cascades to ExamQuestion/ExamClass/ExamSection/ExamAdministrator
      // — deleting it next handles all four. The underlying Question/
      // QuestionRevision is APPROVED and therefore genuinely, permanently
      // undeletable (same reasoning as question-lifecycle.integration
      // .test.ts's own afterAll) — best-effort, harmless (RLS-scoped,
      // uniquely UUID-named, never reachable outside this deleted school
      // pair).
      await owner.exam.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.studentProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.question.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.classSubject
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.classGroup
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.subject.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.academicTerm
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.academicSession
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.teacherProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.roleAssignment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.schoolMembership
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.school.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
      await owner.$disconnect();
      await app.$disconnect();
    });

    const tables: Array<{ label: string; table: string; idA: () => string; idB: () => string }> = [
      { label: 'exams', table: 'exams', idA: () => examA.id, idB: () => examB.id },
      {
        label: 'exam_classes',
        table: 'exam_classes',
        idA: () => examClassA.id,
        idB: () => examClassB.id,
      },
      {
        label: 'exam_sections',
        table: 'exam_sections',
        idA: () => examSectionA.id,
        idB: () => examSectionB.id,
      },
      {
        label: 'exam_questions',
        table: 'exam_questions',
        idA: () => examQuestionA.id,
        idB: () => examQuestionB.id,
      },
      {
        label: 'exam_sessions',
        table: 'exam_sessions',
        idA: () => examSessionA.id,
        idB: () => examSessionB.id,
      },
      {
        label: 'exam_session_participants',
        table: 'exam_session_participants',
        idA: () => examSessionParticipantA.id,
        idB: () => examSessionParticipantB.id,
      },
      {
        label: 'exam_participations',
        table: 'exam_participations',
        idA: () => examParticipationA.id,
        idB: () => examParticipationB.id,
      },
      {
        label: 'exam_administrators',
        table: 'exam_administrators',
        idA: () => examAdministratorA.id,
        idB: () => examAdministratorB.id,
      },
    ];

    it.each(tables)(
      '$label: with no tenant context set, RLS blocks all rows (fails closed)',
      async ({ table, idA, idB }) => {
        const rows = await app.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
          idA(),
          idB(),
        );
        expect(rows).toHaveLength(0);
      },
    );

    it.each(tables)(
      "$label: scoped to school A, only school A's row is visible",
      async ({ table, idA, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ school_id: string }>>(
            `SELECT school_id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
            idA(),
            idB(),
          ),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.school_id).toBe(schoolA.id);
      },
    );

    it.each(tables)(
      '$label: an explicit cross-tenant read by id returns nothing, even by primary key',
      async ({ table, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM ${table} WHERE id = $1::uuid`,
            idB(),
          ),
        );
        expect(rows).toHaveLength(0);
      },
    );
  },
);

/**
 * B10's `audit_events` — a deliberately SEPARATE describe block, not
 * appended to the shared B5-B9 block above, mirroring B11's own precedent
 * but for a more severe reason than that block's parent-status one:
 * `audit_events` gained an *unconditional* append-only trigger this phase
 * (see the B10 migration's own comment) — every row, not just ones whose
 * parent reached some particular status, is permanently undeletable the
 * instant it's written. `School.auditEvents` cascades on delete, so this
 * fixture's own school-delete would otherwise throw. The shared B5-B9
 * block's own `notifications`/`question_reviews` entries already prove
 * `.catch(() => undefined)` alone is sufficient for a table like that —
 * but `audit_events` additionally participates in the *cascade chain* of
 * nearly every other integration test file in this codebase (~55 action-
 * emitting call sites across academics/users/exams/platform/imports/
 * question-review), which is why this table specifically gets its own
 * dedicated fixture pair here rather than risk ever mixing it into a
 * block whose other rows might reasonably expect a clean cascade delete.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — audit_events (B10, ADR-0023, 07 §42 invariant 15)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let userA: { id: string };
    let userB: { id: string };
    let eventA: { id: string };
    let eventB: { id: string };

    async function buildFixture(label: string) {
      const school = await owner.school.create({
        data: {
          name: `Audit RLS School ${label} ${randomUUID()}`,
          subdomain: `audit-rls-${label.toLowerCase()}-${Date.now()}`,
        },
      });
      const user = await owner.user.create({
        data: { firstName: 'Admin', lastName: label, displayName: `Admin ${label}` },
      });
      const event = await withTenant(owner, school.id, (tx) =>
        tx.auditEvent.create({
          data: {
            schoolId: school.id,
            actorUserId: user.id,
            actorRole: 'SCHOOL_ADMIN',
            action: 'CLASS_GROUP_CREATED',
          },
        }),
      );
      return { school, user, event };
    }

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      const a = await buildFixture('A');
      const b = await buildFixture('B');
      schoolA = a.school;
      schoolB = b.school;
      userA = a.user;
      userB = b.user;
      eventA = a.event;
      eventB = b.event;
    });

    afterAll(async () => {
      // Every audit_events row this fixture wrote is genuinely, permanently
      // undeletable (the unconditional trigger this phase introduces) —
      // best-effort throughout, harmless (RLS-scoped, uniquely UUID-named,
      // never reachable outside this deleted school pair).
      await owner.school
        .deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } })
        .catch(() => undefined);
      await owner.user
        .deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
        .catch(() => undefined);
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      const rows = await app.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM audit_events WHERE id IN ($1::uuid, $2::uuid)`,
        eventA.id,
        eventB.id,
      );
      expect(rows).toHaveLength(0);
    });

    it("scoped to school A, only school A's row is visible", async () => {
      const rows = await withTenant(app, schoolA.id, (tx) =>
        tx.$queryRawUnsafe<Array<{ school_id: string }>>(
          `SELECT school_id FROM audit_events WHERE id IN ($1::uuid, $2::uuid)`,
          eventA.id,
          eventB.id,
        ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it('an explicit cross-tenant read by id returns nothing, even by primary key', async () => {
      const rows = await withTenant(app, schoolA.id, (tx) =>
        tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM audit_events WHERE id = $1::uuid`,
          eventB.id,
        ),
      );
      expect(rows).toHaveLength(0);
    });

    it("the atlas_audit_reader role sees both schools' rows in one query, with no tenant context ever set", async () => {
      const auditReaderUrl =
        process.env.DATABASE_AUDIT_READER_URL_TEST ?? process.env.DATABASE_AUDIT_READER_URL;
      if (!auditReaderUrl) return; // env not configured in this run — the dedicated operations-module test covers this path too.
      const reader = createPrismaClient(auditReaderUrl);
      try {
        const rows = await reader.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM audit_events WHERE id IN ($1::uuid, $2::uuid)`,
          eventA.id,
          eventB.id,
        );
        expect(rows).toHaveLength(2);
      } finally {
        await reader.$disconnect();
      }
    });

    it('the atlas_audit_reader role cannot write to audit_events, and cannot read any other table', async () => {
      const auditReaderUrl =
        process.env.DATABASE_AUDIT_READER_URL_TEST ?? process.env.DATABASE_AUDIT_READER_URL;
      if (!auditReaderUrl) return;
      const reader = createPrismaClient(auditReaderUrl);
      try {
        await expect(
          reader.$executeRawUnsafe(
            `INSERT INTO audit_events (school_id, actor_user_id, actor_role, action) VALUES ($1::uuid, $2::uuid, 'SCHOOL_ADMIN', 'X')`,
            schoolA.id,
            userA.id,
          ),
        ).rejects.toThrow(/permission denied/i);
        await expect(
          reader.$queryRawUnsafe(`SELECT id FROM schools WHERE id = $1::uuid`, schoolA.id),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await reader.$disconnect();
      }
    });
  },
);

/**
 * B13's five new tables (ExamAttempt, AttemptQuestionSnapshot,
 * AttemptAnswer, AttemptAnswerEvent, AttemptEvent), plus B14's
 * AttemptQuestionResult — a deliberately SEPARATE describe block, mirroring
 * the B11/B12 block's own precedent (and its reasoning) exactly:
 * `attempt_question_snapshots` carries an UNCONDITIONAL immutability
 * trigger (no parent-status gate at all — every row is undeletable the
 * instant it's written, ADR-0008), and `attempt_answer_events` carries the
 * identical unconditional shape (ADR-0007). Mixing either into the shared
 * B5-B9 block, or even the B11/B12 block above (whose own APPROVED-revision
 * fixture already needs isolating for the *same* class of reason), would
 * make that block's own multi-row `deleteMany` cleanup abort entirely on
 * the first blocked row. `attempt_answers` itself is only CONDITIONALLY
 * immutable (blocked only once its parent `exam_attempts.state` leaves
 * `IN_PROGRESS`) — this fixture's own primary attempt is deliberately left
 * `IN_PROGRESS` throughout, so that row alone deletes cleanly; `exam_
 * attempts` itself still can't be deleted while its `Restrict`-FK'd
 * `attempt_question_snapshots`/`attempt_answer_events` children remain,
 * cascading the same "genuinely, permanently undeletable, best-effort,
 * harmless" pattern up through `exam_sessions`/`exams` exactly as the
 * B11/B12 block's own teardown already documents for its APPROVED question.
 *
 * `attempt_question_results` (B14) carries NO immutability trigger at all
 * (re-marking is a deliberate, expected overwrite — its own schema doc
 * comment) — only a write GUARD blocking INSERT/UPDATE while the parent
 * attempt is still IN_PROGRESS. Since this block's primary attempt is kept
 * IN_PROGRESS specifically so `attempt_answers` deletes cleanly, a SECOND,
 * minimal attempt (transitioned straight to SUBMITTED, no snapshot/answers
 * of its own needed — AttemptQuestionResult's only real FK is to
 * exam_attempts) carries the one AttemptQuestionResult row this block's own
 * RLS assertions need.
 */
describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation — exam_attempts, attempt_authorizations, attempt_question_snapshots, attempt_answers, attempt_answer_events, attempt_events, attempt_question_results, results, result_publications, result_adjustment_operations, result_adjustments, grading_scales, grading_scale_versions, grading_scale_bands (B13/B14/B15/B16, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };
    let attemptA: { id: string };
    let attemptB: { id: string };
    let authorizationA: { id: string };
    let authorizationB: { id: string };
    let snapshotA: { id: string };
    let snapshotB: { id: string };
    let answerA: { id: string };
    let answerB: { id: string };
    let answerEventA: { id: string };
    let answerEventB: { id: string };
    let eventA: { id: string };
    let eventB: { id: string };
    let resultA: { id: string };
    let resultB: { id: string };
    let examResultA: { id: string };
    let examResultB: { id: string };
    let resultPublicationA: { id: string };
    let resultPublicationB: { id: string };
    let adjustmentOperationA: { id: string };
    let adjustmentOperationB: { id: string };
    let adjustmentA: { id: string };
    let adjustmentB: { id: string };
    let gradingScaleA: { id: string };
    let gradingScaleB: { id: string };
    let gradingScaleVersionA: { id: string };
    let gradingScaleVersionB: { id: string };
    let gradingScaleBandA: { id: string };
    let gradingScaleBandB: { id: string };

    async function buildFixture(label: string) {
      const school = await owner.school.create({
        data: {
          name: `Attempt RLS School ${label} ${randomUUID()}`,
          subdomain: `attempt-rls-${label.toLowerCase()}-${Date.now()}`,
        },
      });
      const teacherUser = await owner.user.create({
        data: { firstName: 'Teacher', lastName: label, displayName: `Teacher ${label}` },
      });
      const teacherMembership = await withTenant(owner, school.id, (tx) =>
        tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: teacherUser.id,
            loginIdentifier: `attempt-rls-teacher-${label.toLowerCase()}-${Date.now()}`,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: teacherMembership.id, role: 'TEACHER' },
        }),
      );
      const start = new Date('2026-09-01');
      const end = new Date('2027-07-31');
      const session = await withTenant(owner, school.id, (tx) =>
        tx.academicSession.create({
          data: {
            schoolId: school.id,
            name: `Attempt-RLS-${label}-${randomUUID().slice(0, 8)}`,
            startDate: start,
            endDate: end,
          },
        }),
      );
      const term = await withTenant(owner, school.id, (tx) =>
        tx.academicTerm.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            name: 'First Term',
            sequence: 1,
            startDate: start,
            endDate: end,
          },
        }),
      );
      const classGroup = await withTenant(owner, school.id, (tx) =>
        tx.classGroup.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            name: 'SS2A',
            level: 'SS2',
            arm: 'A',
          },
        }),
      );
      const subject = await withTenant(owner, school.id, (tx) =>
        tx.subject.create({
          data: {
            schoolId: school.id,
            name: 'Mathematics',
            code: `MTH-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      const classSubject = await withTenant(owner, school.id, (tx) =>
        tx.classSubject.create({
          data: {
            schoolId: school.id,
            classId: classGroup.id,
            subjectId: subject.id,
            academicSessionId: session.id,
          },
        }),
      );
      const teacherProfile = await withTenant(owner, school.id, (tx) =>
        tx.teacherProfile.create({
          data: {
            schoolId: school.id,
            membershipId: teacherMembership.id,
            staffId: `STF-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );
      const question = await withTenant(owner, school.id, (tx) =>
        tx.question.create({
          data: {
            schoolId: school.id,
            subjectId: subject.id,
            level: 'SS2',
            authorTeacherProfileId: teacherProfile.id,
          },
        }),
      );
      const revision = await withTenant(owner, school.id, (tx) =>
        tx.questionRevision.create({
          data: {
            schoolId: school.id,
            questionId: question.id,
            revisionNumber: 1,
            questionType: 'SINGLE_CHOICE',
            content: `Attempt RLS question ${label}`,
            difficulty: 'EASY',
            marks: 2,
            createdByMembershipId: teacherMembership.id,
            status: 'DRAFT',
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.question.update({
          where: { id: question.id },
          data: { currentRevisionId: revision.id },
        }),
      );
      // The one status transition INTO APPROVED — allowed (OLD.status is
      // DRAFT here, not APPROVED yet).
      await withTenant(owner, school.id, (tx) =>
        tx.questionRevision.update({ where: { id: revision.id }, data: { status: 'APPROVED' } }),
      );

      const exam = await withTenant(owner, school.id, (tx) =>
        tx.exam.create({
          data: {
            schoolId: school.id,
            academicSessionId: session.id,
            academicTermId: term.id,
            subjectId: subject.id,
            title: `Attempt RLS Exam ${label}`,
            examType: 'Mock Examination',
            durationSeconds: 3600,
            resultPolicy: 'TEACHER',
            resultDetailVisibility: 'SCORE_ONLY',
            createdByMembershipId: teacherMembership.id,
          },
        }),
      );
      const examSection = await withTenant(owner, school.id, (tx) =>
        tx.examSection.create({ data: { schoolId: school.id, examId: exam.id } }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.examClass.create({
          data: { schoolId: school.id, examId: exam.id, classSubjectId: classSubject.id },
        }),
      );
      const examQuestion = await withTenant(owner, school.id, (tx) =>
        tx.examQuestion.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            examSectionId: examSection.id,
            questionRevisionId: revision.id,
            sequence: 1,
            marks: 2,
          },
        }),
      );

      const studentUser = await owner.user.create({
        data: { firstName: 'Student', lastName: label, displayName: `Student ${label}` },
      });
      const studentMembership = await withTenant(owner, school.id, (tx) =>
        tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: studentUser.id,
            loginIdentifier: `attempt-rls-student-${label.toLowerCase()}-${Date.now()}`,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: studentMembership.id, role: 'STUDENT' },
        }),
      );
      const studentProfile = await withTenant(owner, school.id, (tx) =>
        tx.studentProfile.create({
          data: {
            schoolId: school.id,
            membershipId: studentMembership.id,
            studentId: `ST-RLS-${label}-${randomUUID().slice(0, 6)}`,
          },
        }),
      );

      const examSession = await withTenant(owner, school.id, (tx) =>
        tx.examSession.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            openedByMembershipId: teacherMembership.id,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.examSessionParticipant.create({
          data: {
            schoolId: school.id,
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
          },
        }),
      );
      const authorization = await withTenant(owner, school.id, (tx) =>
        tx.attemptAuthorization.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
            type: 'SPECIAL',
            reason: `RLS fixture ${label}`,
            authorizedByMembershipId: teacherMembership.id,
          },
        }),
      );

      // Deliberately left IN_PROGRESS — see this block's own header comment
      // on why (keeps attempt_answers cleanly deletable in teardown).
      const attempt = await withTenant(owner, school.id, (tx) =>
        tx.examAttempt.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
            attemptNumber: 1,
            durationGrantedSeconds: 3600,
            expiresAt: new Date(Date.now() + 3600 * 1000),
          },
        }),
      );
      const snapshot = await withTenant(owner, school.id, (tx) =>
        tx.attemptQuestionSnapshot.create({
          data: {
            schoolId: school.id,
            attemptId: attempt.id,
            seed: `rls-${label}`,
            document: { version: 1, seed: `rls-${label}`, questions: [] },
          },
        }),
      );
      const answer = await withTenant(owner, school.id, (tx) =>
        tx.attemptAnswer.create({
          data: {
            schoolId: school.id,
            attemptId: attempt.id,
            examQuestionId: examQuestion.id,
            sequenceNumber: 1,
          },
        }),
      );
      const answerEvent = await withTenant(owner, school.id, (tx) =>
        tx.attemptAnswerEvent.create({
          data: {
            schoolId: school.id,
            attemptId: attempt.id,
            examQuestionId: examQuestion.id,
            sequenceNumber: 1,
            source: 'online',
          },
        }),
      );
      const event = await withTenant(owner, school.id, (tx) =>
        tx.attemptEvent.create({
          data: {
            schoolId: school.id,
            attemptId: attempt.id,
            type: 'RESUMED',
            occurredAt: new Date(),
          },
        }),
      );

      // B14: a second, minimal attempt, created directly SUBMITTED (this
      // block's own header comment explains why the primary attempt above
      // can't carry this row) — a legitimate fixture shortcut, mirroring
      // `exam-control-refresh.integration.test.ts`'s own "direct create
      // with a non-default status" precedent: the exam_attempts_status_
      // transition_guard trigger only fires on UPDATE (`BEFORE UPDATE OF
      // state`), never INSERT, so this bypasses nothing that trigger
      // itself checks. Also sidesteps `exam_attempts_active_unique` (at
      // most one IN_PROGRESS attempt per school/exam/student) — the
      // primary attempt above is deliberately left IN_PROGRESS for the
      // same (exam, student), so a second IN_PROGRESS attempt there would
      // collide on that real partial index.
      const secondAttempt = await withTenant(owner, school.id, (tx) =>
        tx.examAttempt.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            examSessionId: examSession.id,
            studentProfileId: studentProfile.id,
            attemptNumber: 2,
            state: 'SUBMITTED',
            durationGrantedSeconds: 3600,
            expiresAt: new Date(Date.now() + 3600 * 1000),
            submittedAt: new Date(),
          },
        }),
      );
      const result = await withTenant(owner, school.id, (tx) =>
        tx.attemptQuestionResult.create({
          data: {
            schoolId: school.id,
            attemptId: secondAttempt.id,
            examQuestionId: examQuestion.id,
            correctness: 'CORRECT',
            awardedMarks: 2,
            maximumMarks: 2,
          },
        }),
      );

      // B15's seven tables. They hang off rows this fixture already builds
      // (the exam, and the SUBMITTED second attempt a Result requires), so
      // they extend this block rather than duplicating its whole fixture in
      // a ninth one — the same "economy" precedent B3-B10 used. Nothing here
      // makes teardown worse: this block's rows are already permanently
      // undeletable via attempt_question_snapshots/attempt_answer_events.
      const gradingScale = await withTenant(owner, school.id, (tx) =>
        tx.gradingScale.create({ data: { schoolId: school.id, name: `RLS scale ${label}` } }),
      );
      const gradingScaleVersion = await withTenant(owner, school.id, (tx) =>
        tx.gradingScaleVersion.create({
          data: { schoolId: school.id, scaleId: gradingScale.id, versionNumber: 1 },
        }),
      );
      const gradingScaleBand = await withTenant(owner, school.id, (tx) =>
        tx.gradingScaleBand.create({
          data: {
            schoolId: school.id,
            versionId: gradingScaleVersion.id,
            label: 'A',
            minPercentage: 0,
            maxPercentage: 100,
            isPassing: true,
            sortOrder: 0,
          },
        }),
      );
      await withTenant(owner, school.id, (tx) =>
        tx.gradingScale.update({
          where: { id: gradingScale.id },
          data: { currentVersionId: gradingScaleVersion.id },
        }),
      );

      const examResult = await withTenant(owner, school.id, (tx) =>
        tx.result.create({
          data: {
            schoolId: school.id,
            attemptId: secondAttempt.id,
            examId: exam.id,
            studentProfileId: studentProfile.id,
            state: 'FINAL',
            finalizedAt: new Date(),
            totalMarks: 2,
            earnedMarks: 2,
            percentage: 100,
            correctCount: 1,
            incorrectCount: 0,
            unansweredCount: 0,
            partialCount: 0,
            grade: 'A',
            gradingScaleVersionId: gradingScaleVersion.id,
          },
        }),
      );
      const resultPublication = await withTenant(owner, school.id, (tx) =>
        tx.resultPublication.create({
          data: { schoolId: school.id, examId: exam.id, status: 'UNPUBLISHED' },
        }),
      );
      const adjustmentOperation = await withTenant(owner, school.id, (tx) =>
        tx.resultAdjustmentOperation.create({
          data: {
            schoolId: school.id,
            examId: exam.id,
            type: 'AWARD_MARK',
            reason: `RLS fixture ${label}`,
            markDelta: 1,
            totalCount: 1,
            createdByMembershipId: teacherMembership.id,
          },
        }),
      );
      const adjustment = await withTenant(owner, school.id, (tx) =>
        tx.resultAdjustment.create({
          data: {
            schoolId: school.id,
            operationId: adjustmentOperation.id,
            resultId: examResult.id,
            adjustmentType: 'AWARD_MARK',
            oldValue: { earnedMarks: 2 },
            newValue: { earnedMarks: 2 },
            reason: `RLS fixture ${label}`,
            authorizedByMembershipId: teacherMembership.id,
          },
        }),
      );

      return {
        school,
        attempt,
        authorization,
        secondAttempt,
        snapshot,
        answer,
        answerEvent,
        event,
        result,
        examResult,
        resultPublication,
        adjustmentOperation,
        adjustment,
        gradingScale,
        gradingScaleVersion,
        gradingScaleBand,
      };
    }

    beforeAll(async () => {
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      const a = await buildFixture('A');
      const b = await buildFixture('B');
      schoolA = a.school;
      schoolB = b.school;
      attemptA = a.attempt;
      attemptB = b.attempt;
      authorizationA = a.authorization;
      authorizationB = b.authorization;
      snapshotA = a.snapshot;
      snapshotB = b.snapshot;
      answerA = a.answer;
      answerB = b.answer;
      answerEventA = a.answerEvent;
      answerEventB = b.answerEvent;
      eventA = a.event;
      eventB = b.event;
      resultA = a.result;
      resultB = b.result;
      examResultA = a.examResult;
      examResultB = b.examResult;
      resultPublicationA = a.resultPublication;
      resultPublicationB = b.resultPublication;
      adjustmentOperationA = a.adjustmentOperation;
      adjustmentOperationB = b.adjustmentOperation;
      adjustmentA = a.adjustment;
      adjustmentB = b.adjustment;
      gradingScaleA = a.gradingScale;
      gradingScaleB = b.gradingScale;
      gradingScaleVersionA = a.gradingScaleVersion;
      gradingScaleVersionB = b.gradingScaleVersion;
      gradingScaleBandA = a.gradingScaleBand;
      gradingScaleBandB = b.gradingScaleBand;
    });

    afterAll(async () => {
      const ids = [schoolA.id, schoolB.id];
      // B15: result_adjustments is UNCONDITIONALLY immutable, so its own
      // delete always fails and everything Restrict-FK'd behind it (results,
      // the adjustment operation, the graded grading-scale version) stays
      // too — the same permanent, harmless leftover this block already
      // accepts for attempt_question_snapshots/attempt_answer_events.
      await owner.resultAdjustment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.resultAdjustmentOperation
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.result.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.resultPublication
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.gradingScale
        .updateMany({ where: { schoolId: { in: ids } }, data: { currentVersionId: null } })
        .catch(() => undefined);
      await owner.gradingScaleBand
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.gradingScaleVersion
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.gradingScale
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // attempt_question_results (B14) carries no immutability trigger at
      // all — deletes cleanly regardless of the parent attempt's state.
      await owner.attemptQuestionResult
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // attempt_events carries no immutability trigger — deletes cleanly.
      await owner.attemptEvent
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // attempt_answers is only conditionally immutable (blocked once its
      // parent leaves IN_PROGRESS) — this fixture's attempt never left it,
      // so this deletes cleanly too.
      await owner.attemptAnswer
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // attempt_answer_events and attempt_question_snapshots are BOTH
      // unconditionally immutable — genuinely, permanently undeletable,
      // exactly like the B11/B12 block's own APPROVED question. Best-
      // effort only; harmless (RLS-scoped, uniquely UUID-named, never
      // reachable outside this deleted school pair).
      await owner.attemptAnswerEvent
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.attemptQuestionSnapshot
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      // exam_attempts is Restrict-FK'd by both of the tables above — stays
      // undeletable in practice while either survives, cascading the same
      // best-effort pattern up through every table below it.
      await owner.examAttempt
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.attemptAuthorization
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.examSessionParticipant
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.examSession
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.exam.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.studentProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.question.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.classSubject
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.classGroup
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.subject.deleteMany({ where: { schoolId: { in: ids } } }).catch(() => undefined);
      await owner.academicTerm
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.academicSession
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.teacherProfile
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.roleAssignment
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.schoolMembership
        .deleteMany({ where: { schoolId: { in: ids } } })
        .catch(() => undefined);
      await owner.school.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
      await owner.$disconnect();
      await app.$disconnect();
    });

    const tables: Array<{ label: string; table: string; idA: () => string; idB: () => string }> = [
      {
        label: 'exam_attempts',
        table: 'exam_attempts',
        idA: () => attemptA.id,
        idB: () => attemptB.id,
      },
      {
        label: 'attempt_authorizations',
        table: 'attempt_authorizations',
        idA: () => authorizationA.id,
        idB: () => authorizationB.id,
      },
      {
        label: 'attempt_question_snapshots',
        table: 'attempt_question_snapshots',
        idA: () => snapshotA.id,
        idB: () => snapshotB.id,
      },
      {
        label: 'attempt_answers',
        table: 'attempt_answers',
        idA: () => answerA.id,
        idB: () => answerB.id,
      },
      {
        label: 'attempt_answer_events',
        table: 'attempt_answer_events',
        idA: () => answerEventA.id,
        idB: () => answerEventB.id,
      },
      {
        label: 'attempt_events',
        table: 'attempt_events',
        idA: () => eventA.id,
        idB: () => eventB.id,
      },
      {
        label: 'attempt_question_results',
        table: 'attempt_question_results',
        idA: () => resultA.id,
        idB: () => resultB.id,
      },
      { label: 'results', table: 'results', idA: () => examResultA.id, idB: () => examResultB.id },
      {
        label: 'result_publications',
        table: 'result_publications',
        idA: () => resultPublicationA.id,
        idB: () => resultPublicationB.id,
      },
      {
        label: 'result_adjustment_operations',
        table: 'result_adjustment_operations',
        idA: () => adjustmentOperationA.id,
        idB: () => adjustmentOperationB.id,
      },
      {
        label: 'result_adjustments',
        table: 'result_adjustments',
        idA: () => adjustmentA.id,
        idB: () => adjustmentB.id,
      },
      {
        label: 'grading_scales',
        table: 'grading_scales',
        idA: () => gradingScaleA.id,
        idB: () => gradingScaleB.id,
      },
      {
        label: 'grading_scale_versions',
        table: 'grading_scale_versions',
        idA: () => gradingScaleVersionA.id,
        idB: () => gradingScaleVersionB.id,
      },
      {
        label: 'grading_scale_bands',
        table: 'grading_scale_bands',
        idA: () => gradingScaleBandA.id,
        idB: () => gradingScaleBandB.id,
      },
    ];

    it.each(tables)(
      '$label: with no tenant context set, RLS blocks all rows (fails closed)',
      async ({ table, idA, idB }) => {
        const rows = await app.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
          idA(),
          idB(),
        );
        expect(rows).toHaveLength(0);
      },
    );

    it.each(tables)(
      "$label: scoped to school A, only school A's row is visible",
      async ({ table, idA, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ school_id: string }>>(
            `SELECT school_id FROM ${table} WHERE id IN ($1::uuid, $2::uuid)`,
            idA(),
            idB(),
          ),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.school_id).toBe(schoolA.id);
      },
    );

    it.each(tables)(
      '$label: an explicit cross-tenant read by id returns nothing, even by primary key',
      async ({ table, idB }) => {
        const rows = await withTenant(app, schoolA.id, (tx) =>
          tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM ${table} WHERE id = $1::uuid`,
            idB(),
          ),
        );
        expect(rows).toHaveLength(0);
      },
    );
  },
);
