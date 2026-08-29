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
      await owner.auditEvent.deleteMany({ where: { schoolId: { in: [schoolA.id, schoolB.id] } } });
      await owner.user.delete({ where: { id: actor.id } });
      await owner.school.deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } });
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
    });

    afterAll(async () => {
      const ids = [schoolA.id, schoolB.id];
      await owner.importRow.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.importJob.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.studentSubjectRegistration.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.teacherAssignment.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.studentEnrollment.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.studentProfile.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.teacherProfile.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.hODAssignment.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.classSubject.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.classGroup.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.subject.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.department.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.academicTerm.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.academicSession.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.roleAssignment.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.schoolMembership.deleteMany({ where: { schoolId: { in: ids } } });
      await owner.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
      await owner.school.deleteMany({ where: { id: { in: ids } } });
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
