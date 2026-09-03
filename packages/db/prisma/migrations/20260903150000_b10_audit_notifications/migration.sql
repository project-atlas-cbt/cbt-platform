-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('QUESTION_APPROVED', 'QUESTION_REJECTED', 'QUESTION_CHANGES_REQUESTED', 'RESULT_PUBLISHED', 'EXAM_OPENED', 'MAKEUP_GRANTED', 'SUBSCRIPTION_EXPIRING', 'STUDENTS_UNASSIGNED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "related_entity_type" VARCHAR(64),
    "related_entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_school_id_recipient_user_id_status_created_at_idx" ON "notifications"("school_id", "recipient_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_school_id_actor_user_id_occurred_at_idx" ON "audit_events"("school_id", "actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_school_id_action_occurred_at_idx" ON "audit_events"("school_id", "action", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_school_id_entity_type_entity_id_idx" ON "audit_events"("school_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as B3's/B4's/B5's/B6's/B8's/B9's
-- own hand-written RLS/trigger blocks.

-- RLS (ADR-0023): notifications is school-owned, same as every other table
-- in this domain since B0's bootstrap migration. No immutability trigger
-- here (unlike audit_events below) — status/read_at are legitimately
-- mutable (mark-read).
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notifications_isolation" ON "notifications"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- Roadmap's own Database work: "AuditEvent... Append-only enforced at the
-- database level: updates and deletes rejected by trigger or by restricted
-- grants." (07 §42 invariant 15, B10 DoD item 2.) Mirrors B9's
-- question_reviews trigger exactly — unconditional, since an audit_events
-- row is never legitimately mutated at all, regardless of any other
-- table's state.
CREATE OR REPLACE FUNCTION enforce_audit_event_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events row % is immutable once written — % is rejected (07 §42 invariant 15 / B10 DoD item 2).',
    OLD.id, TG_OP
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_event_immutability();

-- Belt-and-suspenders alongside the trigger above, satisfying the
-- roadmap's literal "rejected by trigger or by restricted grants" wording:
-- atlas_app (the only role that ever writes audit_events as the running
-- application) never legitimately needs UPDATE/DELETE on this table.
--
-- Gap closure: packages/db/src/grants.ts's grantAppRole() (called after
-- every `migrate deploy`/`migrate reset`, including by every integration
-- test file that bootstraps its own database) does a blanket
-- `GRANT ... ON ALL TABLES IN SCHEMA public TO atlas_app` that would
-- otherwise silently re-grant this exact privilege back — the same footgun
-- B2's own migration comment already named for this table. grantAppRole()
-- now re-asserts this REVOKE itself immediately after its own blanket
-- grant, so the two stay in agreement no matter how many times either runs.
REVOKE UPDATE, DELETE ON "audit_events" FROM atlas_app;

-- atlas_audit_reader (B10): a narrowly-scoped, read-only role for
-- GET /v1/platform/audit's cross-school query — the alternative to
-- iterating every school's RLS-scoped connection one withTenant() call at
-- a time (see PlatformMetricsService's own doc comment for why that
-- doesn't compose with real filtering/pagination for a query like this
-- one). Deliberately NOT BYPASSRLS: that attribute isn't scopable to one
-- table and would exempt this role from every other RLS-protected table in
-- the database, not just this one. Instead: a SELECT-only grant on
-- audit_events alone, plus a second, additive, permissive SELECT policy
-- scoped TO this role only.
--
-- audit_events_isolation (the B2 migration) has no TO clause, so it
-- applies to every role via PUBLIC, including this one. Postgres combines
-- multiple permissive policies for the same command with OR — this
-- policy's unconditional USING (true), scoped TO atlas_audit_reader only,
-- makes that OR always true for this role without touching atlas_app's
-- (or any other role's) evaluation of the isolation policy at all.
-- FORCE ROW LEVEL SECURITY (already set on audit_events) only changes
-- behavior for the table owner ("atlas"), not a non-owner, non-superuser
-- role like this one, so it has no bearing here either.
--
-- No grant on any other table, ever — the role's blast radius is
-- literally this one table, auditable via \d+ audit_events or this
-- migration's own diff. Actor display-name enrichment for
-- GET /v1/platform/audit is a follow-up, batched, per-school query through
-- the normal atlas_app/withTenant connection, never through this one.
-- The role itself (CREATE ROLE, cluster-wide, not database-scoped) lives
-- in infra/postgres/init.sql and this CI workflow's hand-written bootstrap
-- step — never in a migration, mirroring atlas_app's own precedent exactly.
GRANT SELECT ON "audit_events" TO atlas_audit_reader;

CREATE POLICY "audit_events_platform_reader" ON "audit_events"
  FOR SELECT
  TO atlas_audit_reader
  USING (true);
