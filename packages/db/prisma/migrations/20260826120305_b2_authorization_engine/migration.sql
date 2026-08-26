-- CreateTable
CREATE TABLE "platform_role_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_role" "Role" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64),
    "entity_id" UUID,
    "reason" TEXT,
    "break_glass" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_role_assignments_user_id_idx" ON "platform_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_school_id_idx" ON "audit_events"("school_id");

-- CreateIndex
CREATE INDEX "audit_events_school_id_occurred_at_idx" ON "audit_events"("school_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlatformRoleAssignment.role reuses the shared Role enum (see the model's
-- own doc comment) rather than a dedicated one-member enum, so the schema
-- must reject a school-role value here at the database level, not only in
-- application code — a platform role table with a school role row in it
-- would be a real authorization defect, not just an odd data shape.
ALTER TABLE "platform_role_assignments"
  ADD CONSTRAINT "platform_role_assignments_role_is_platform_role"
  CHECK ("role" = 'SOFTWARE_ADMIN');

-- ADR-0023: Row-Level Security, same convention every school-owned table
-- since rls_bootstrap has followed (see that migration's own comment for
-- the full FORCE / superuser-bypass rationale — unchanged here).
--
-- audit_events' session variable is the *affected* school for a break-
-- glass write (ADR-0012 requires visibility to the target school), not
-- necessarily the actor's own school — Software Admin has none. Writing a
-- cross-tenant break-glass row therefore goes through withTenant(prisma,
-- targetSchoolId, ...) deliberately, exactly the explicit bypass path
-- @atlas/db's tenancy.ts already anticipated for B2 (see that file's
-- closing comment). RLS still applies to every read/write here — there is
-- no separate "break-glass bypasses RLS" mode; break-glass writes under
-- the *target* school's own tenant context like any other write to that
-- school's data.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_isolation" ON "audit_events"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- 07 §11.1: "Audit events are append-only." Full DB-enforced immutability
-- (a trigger rejecting UPDATE/DELETE outright, or a narrower GRANT on this
-- table, per B10's own Database work section) is deliberately NOT done
-- here: a plain REVOKE UPDATE at this stage would be silently undone by
-- @atlas/db's grantAppRole() (packages/db/src/grants.ts), which
-- unconditionally re-GRANTs UPDATE/DELETE on every table in `public` after
-- any migrate reset/deploy that calls it — a revoke that quietly stops
-- working is worse than no revoke, since it would look enforced without
-- being enforced. AuditService (apps/api) only ever INSERTs; real
-- enforcement plus a retention policy is B10's job, done properly (e.g.
-- carving audit_events out of grantAppRole()'s blanket grant, or a
-- trigger) rather than half-done here.
