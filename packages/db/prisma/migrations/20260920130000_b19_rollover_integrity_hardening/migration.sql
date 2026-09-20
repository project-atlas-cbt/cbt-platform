-- B19 hardening: bind every draft to its own plan, reserve destinations, and
-- make committed rollover evidence append-only. This is deliberately a
-- follow-up migration: the initial B19 migration has already been deployed
-- to development databases.

ALTER TABLE "rollover_plans"
  ADD CONSTRAINT "rollover_plans_school_target_key" UNIQUE ("school_id", "target_academic_session_id");

ALTER TABLE "rollover_class_drafts"
  ADD CONSTRAINT "rollover_class_drafts_school_plan_id_key" UNIQUE ("school_id", "rollover_plan_id", "id");

ALTER TABLE "rollover_offering_drafts"
  ADD CONSTRAINT "rollover_offering_drafts_school_plan_id_key" UNIQUE ("school_id", "rollover_plan_id", "id");

ALTER TABLE "student_enrollments"
  ADD CONSTRAINT "student_enrollments_school_id_id_session_key" UNIQUE ("school_id", "id", "academic_session_id");

ALTER TABLE "rollover_decisions"
  ADD COLUMN "source_academic_session_id" uuid;

UPDATE "rollover_decisions" AS d
SET "source_academic_session_id" = p."source_academic_session_id"
FROM "rollover_plans" AS p
WHERE p."id" = d."rollover_plan_id";

ALTER TABLE "rollover_decisions"
  ALTER COLUMN "source_academic_session_id" SET NOT NULL,
  ADD CONSTRAINT "rollover_decisions_source_session_fkey"
    FOREIGN KEY ("school_id", "source_academic_session_id")
    REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_decisions_enrollment_session_fkey"
    FOREIGN KEY ("school_id", "source_enrollment_id", "source_academic_session_id")
    REFERENCES "student_enrollments"("school_id", "id", "academic_session_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_decisions_target_draft_fkey"
    FOREIGN KEY ("school_id", "rollover_plan_id", "target_draft_class_id")
    REFERENCES "rollover_class_drafts"("school_id", "rollover_plan_id", "id") ON DELETE RESTRICT;

ALTER TABLE "rollover_offering_drafts"
  ADD CONSTRAINT "rollover_offering_drafts_target_plan_fkey"
    FOREIGN KEY ("school_id", "rollover_plan_id", "target_draft_class_id")
    REFERENCES "rollover_class_drafts"("school_id", "rollover_plan_id", "id") ON DELETE RESTRICT;

ALTER TABLE "rollover_staff_assignment_drafts"
  ADD CONSTRAINT "rollover_staff_assignment_drafts_membership_fkey"
    FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_staff_assignment_drafts_target_plan_fkey"
    FOREIGN KEY ("school_id", "rollover_plan_id", "target_draft_class_id")
    REFERENCES "rollover_class_drafts"("school_id", "rollover_plan_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_staff_assignment_drafts_subject_fkey"
    FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_staff_assignment_drafts_department_fkey"
    FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "rollover_staff_assignment_drafts_shape_check" CHECK (
    ("assignment_kind" = 'TEACHER' AND "target_draft_class_id" IS NOT NULL AND "subject_id" IS NOT NULL AND "department_id" IS NULL)
    OR
    ("assignment_kind" = 'HOD' AND "target_draft_class_id" IS NULL AND "subject_id" IS NULL AND "department_id" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION prevent_committed_rollover_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'rollover_plans' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'COMMITTED' THEN
      RAISE EXCEPTION 'Committed rollover plans are immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'COMMITTED'
       AND (NEW.committed_at IS NULL OR NEW.committed_by_user_id IS NULL) THEN
      RAISE EXCEPTION 'Committed rollover plans require actor and timestamp evidence';
    END IF;
  ELSIF TG_TABLE_NAME = 'rollover_decisions' THEN
    IF TG_OP = 'UPDATE' AND OLD.committed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Committed rollover decisions are immutable';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM rollover_plans p
    WHERE p.id = OLD.rollover_plan_id
      AND p.school_id = OLD.school_id
      AND p.status = 'COMMITTED'
  ) THEN
    RAISE EXCEPTION 'Drafts belonging to a committed rollover plan are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER rollover_plans_immutable_after_commit
  BEFORE UPDATE ON "rollover_plans"
  FOR EACH ROW EXECUTE FUNCTION prevent_committed_rollover_mutation();
CREATE TRIGGER rollover_decisions_immutable_after_commit
  BEFORE UPDATE ON "rollover_decisions"
  FOR EACH ROW EXECUTE FUNCTION prevent_committed_rollover_mutation();
CREATE TRIGGER rollover_class_drafts_immutable_after_commit
  BEFORE UPDATE ON "rollover_class_drafts"
  FOR EACH ROW EXECUTE FUNCTION prevent_committed_rollover_mutation();
CREATE TRIGGER rollover_offering_drafts_immutable_after_commit
  BEFORE UPDATE ON "rollover_offering_drafts"
  FOR EACH ROW EXECUTE FUNCTION prevent_committed_rollover_mutation();
CREATE TRIGGER rollover_staff_assignment_drafts_immutable_after_commit
  BEFORE UPDATE ON "rollover_staff_assignment_drafts"
  FOR EACH ROW EXECUTE FUNCTION prevent_committed_rollover_mutation();
