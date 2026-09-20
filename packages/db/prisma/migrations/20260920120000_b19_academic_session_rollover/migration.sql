-- B19 — Review-first academic session rollover. Draft rows are isolated from
-- live academic records until the one transactional commit materialises them.
CREATE TYPE "RolloverPlanStatus" AS ENUM ('DRAFT', 'READY', 'COMMITTED');
CREATE TYPE "RolloverOutcome" AS ENUM ('PROMOTE', 'REPEAT', 'TRANSFER', 'GRADUATE', 'WITHDRAW');

-- Needed by B19's school-scoped references to an historic source class.
CREATE UNIQUE INDEX "class_groups_school_id_id_key" ON "class_groups"("school_id", "id");

CREATE TABLE "rollover_plans" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL,
  "source_academic_session_id" uuid NOT NULL,
  "target_academic_session_id" uuid NOT NULL,
  "status" "RolloverPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "readiness_snapshot" jsonb NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "generated_by_user_id" uuid NOT NULL,
  "committed_at" timestamptz(6),
  "committed_by_user_id" uuid,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "rollover_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "rollover_plans_source_session_fkey" FOREIGN KEY ("school_id", "source_academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_plans_target_session_fkey" FOREIGN KEY ("school_id", "target_academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_plans_source_not_target" CHECK ("source_academic_session_id" <> "target_academic_session_id"),
  CONSTRAINT "rollover_plans_school_source_key" UNIQUE ("school_id", "source_academic_session_id"),
  CONSTRAINT "rollover_plans_school_id_key" UNIQUE ("school_id", "id")
);

CREATE TABLE "rollover_class_drafts" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "rollover_plan_id" uuid NOT NULL,
  "source_class_id" uuid NOT NULL, "department_id" uuid, "name" varchar(32) NOT NULL,
  "level" "ClassLevel" NOT NULL, "arm" varchar(16) NOT NULL, "included" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "rollover_class_drafts_plan_fkey" FOREIGN KEY ("school_id", "rollover_plan_id") REFERENCES "rollover_plans"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "rollover_class_drafts_source_fkey" FOREIGN KEY ("school_id", "source_class_id") REFERENCES "class_groups"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_class_drafts_department_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_class_drafts_plan_source_key" UNIQUE ("school_id", "rollover_plan_id", "source_class_id"),
  CONSTRAINT "rollover_class_drafts_school_id_key" UNIQUE ("school_id", "id")
);

CREATE TABLE "rollover_offering_drafts" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "rollover_plan_id" uuid NOT NULL,
  "source_class_subject_id" uuid NOT NULL, "target_draft_class_id" uuid NOT NULL, "subject_id" uuid NOT NULL,
  "included" boolean NOT NULL DEFAULT true, "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "rollover_offering_drafts_plan_fkey" FOREIGN KEY ("school_id", "rollover_plan_id") REFERENCES "rollover_plans"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "rollover_offering_drafts_source_fkey" FOREIGN KEY ("school_id", "source_class_subject_id") REFERENCES "class_subjects"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_offering_drafts_target_fkey" FOREIGN KEY ("school_id", "target_draft_class_id") REFERENCES "rollover_class_drafts"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_offering_drafts_subject_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_offering_drafts_plan_source_key" UNIQUE ("school_id", "rollover_plan_id", "source_class_subject_id")
);

CREATE TABLE "rollover_staff_assignment_drafts" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "rollover_plan_id" uuid NOT NULL,
  "assignment_kind" varchar(16) NOT NULL, "source_assignment_id" uuid NOT NULL, "membership_id" uuid NOT NULL,
  "target_draft_class_id" uuid, "subject_id" uuid, "department_id" uuid, "confirmed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "rollover_staff_assignment_drafts_plan_fkey" FOREIGN KEY ("school_id", "rollover_plan_id") REFERENCES "rollover_plans"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "rollover_staff_assignment_drafts_kind_check" CHECK ("assignment_kind" IN ('TEACHER', 'HOD')),
  CONSTRAINT "rollover_staff_assignment_drafts_plan_kind_source_key" UNIQUE ("school_id", "rollover_plan_id", "assignment_kind", "source_assignment_id")
);

CREATE TABLE "rollover_decisions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "rollover_plan_id" uuid NOT NULL,
  "source_enrollment_id" uuid NOT NULL, "source_class_id" uuid NOT NULL,
  "proposed_outcome" "RolloverOutcome" NOT NULL, "outcome" "RolloverOutcome" NOT NULL,
  "target_draft_class_id" uuid, "reason" varchar(500) NOT NULL, "overridden_by_user_id" uuid,
  "overridden_at" timestamptz(6), "committed_at" timestamptz(6), "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL,
  CONSTRAINT "rollover_decisions_plan_fkey" FOREIGN KEY ("school_id", "rollover_plan_id") REFERENCES "rollover_plans"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "rollover_decisions_enrollment_fkey" FOREIGN KEY ("school_id", "source_enrollment_id") REFERENCES "student_enrollments"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_decisions_source_class_fkey" FOREIGN KEY ("school_id", "source_class_id") REFERENCES "class_groups"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "rollover_decisions_plan_enrollment_key" UNIQUE ("school_id", "rollover_plan_id", "source_enrollment_id")
);

CREATE INDEX "rollover_plans_school_target_idx" ON "rollover_plans"("school_id", "target_academic_session_id");
CREATE INDEX "rollover_plans_school_status_idx" ON "rollover_plans"("school_id", "status");
CREATE INDEX "rollover_class_drafts_school_plan_idx" ON "rollover_class_drafts"("school_id", "rollover_plan_id");
CREATE INDEX "rollover_decisions_school_plan_idx" ON "rollover_decisions"("school_id", "rollover_plan_id");

-- ADR-0023: every rollover record is tenant owned and application-role scoped.
ALTER TABLE "rollover_plans" ENABLE ROW LEVEL SECURITY; ALTER TABLE "rollover_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rollover_class_drafts" ENABLE ROW LEVEL SECURITY; ALTER TABLE "rollover_class_drafts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rollover_offering_drafts" ENABLE ROW LEVEL SECURITY; ALTER TABLE "rollover_offering_drafts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rollover_staff_assignment_drafts" ENABLE ROW LEVEL SECURITY; ALTER TABLE "rollover_staff_assignment_drafts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rollover_decisions" ENABLE ROW LEVEL SECURITY; ALTER TABLE "rollover_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "rollover_plans_isolation" ON "rollover_plans" USING (school_id::text = current_setting('app.current_school_id', true));
CREATE POLICY "rollover_class_drafts_isolation" ON "rollover_class_drafts" USING (school_id::text = current_setting('app.current_school_id', true));
CREATE POLICY "rollover_offering_drafts_isolation" ON "rollover_offering_drafts" USING (school_id::text = current_setting('app.current_school_id', true));
CREATE POLICY "rollover_staff_assignment_drafts_isolation" ON "rollover_staff_assignment_drafts" USING (school_id::text = current_setting('app.current_school_id', true));
CREATE POLICY "rollover_decisions_isolation" ON "rollover_decisions" USING (school_id::text = current_setting('app.current_school_id', true));
