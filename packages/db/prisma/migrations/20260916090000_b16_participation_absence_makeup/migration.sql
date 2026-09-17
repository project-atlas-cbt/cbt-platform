-- B16: participation is authoritative per physical session, while attempt
-- authorizations are single-use overrides of the ordinary attempt limit.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "exam_participations" WHERE "exam_session_id" IS NULL) THEN
    RAISE EXCEPTION 'B16 cannot safely migrate exam_participations with a NULL exam_session_id';
  END IF;
END;
$$;

CREATE TYPE "ExamParticipationStatus_new" AS ENUM ('PENDING', 'ATTENDED', 'ABSENT', 'EXCUSED');
ALTER TABLE "exam_participations"
  ALTER COLUMN "status" TYPE "ExamParticipationStatus_new"
  USING (CASE "status"::text WHEN 'COMPLETED' THEN 'ATTENDED' ELSE "status"::text END)::"ExamParticipationStatus_new";
DROP TYPE "ExamParticipationStatus";
ALTER TYPE "ExamParticipationStatus_new" RENAME TO "ExamParticipationStatus";

DROP INDEX "exam_participations_school_id_exam_id_student_profile_id_key";
ALTER TABLE "exam_participations" ALTER COLUMN "exam_session_id" SET NOT NULL;
CREATE UNIQUE INDEX "exam_participations_school_id_exam_session_id_student_profile_id_key"
  ON "exam_participations" ("school_id", "exam_session_id", "student_profile_id");
ALTER TABLE "exam_participations"
  ADD CONSTRAINT "exam_participations_school_id_exam_session_id_fkey"
  FOREIGN KEY ("school_id", "exam_session_id") REFERENCES "exam_sessions"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "AttemptAuthorizationType" AS ENUM ('MAKEUP', 'RETRY', 'SPECIAL');
CREATE TYPE "AttemptAuthorizationStatus" AS ENUM ('AUTHORIZED', 'USED', 'REVOKED', 'EXPIRED');

CREATE TABLE "attempt_authorizations" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "exam_id" UUID NOT NULL,
  "exam_session_id" UUID NOT NULL,
  "student_profile_id" UUID NOT NULL,
  "type" "AttemptAuthorizationType" NOT NULL,
  "status" "AttemptAuthorizationStatus" NOT NULL DEFAULT 'AUTHORIZED',
  "reason" TEXT NOT NULL,
  "authorized_by_membership_id" UUID NOT NULL,
  "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by_membership_id" UUID,
  "revoked_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "attempt_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attempt_authorizations_school_id_id_key"
  ON "attempt_authorizations" ("school_id", "id");
CREATE INDEX "attempt_authorizations_school_id_exam_id_student_profile_id_status_idx"
  ON "attempt_authorizations" ("school_id", "exam_id", "student_profile_id", "status");
CREATE INDEX "attempt_authorizations_school_id_exam_session_id_idx"
  ON "attempt_authorizations" ("school_id", "exam_session_id");
CREATE UNIQUE INDEX "attempt_authorizations_one_active_per_type"
  ON "attempt_authorizations" ("school_id", "exam_id", "student_profile_id", "type")
  WHERE "status" = 'AUTHORIZED';

ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_school_id_exam_id_fkey"
  FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attempt_authorizations_school_id_exam_session_id_fkey"
  FOREIGN KEY ("school_id", "exam_session_id") REFERENCES "exam_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attempt_authorizations_school_id_student_profile_id_fkey"
  FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_attempts" DROP COLUMN "participation_status";
ALTER TABLE "exam_attempts" ADD COLUMN "attempt_authorization_id" UUID;
CREATE UNIQUE INDEX "exam_attempts_school_id_attempt_authorization_id_key"
  ON "exam_attempts" ("school_id", "attempt_authorization_id");
ALTER TABLE "exam_attempts"
  ADD CONSTRAINT "exam_attempts_school_id_attempt_authorization_id_fkey"
  FOREIGN KEY ("school_id", "attempt_authorization_id") REFERENCES "attempt_authorizations"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_exam_session_belongs_to_exam()
RETURNS TRIGGER AS $$
DECLARE
  session_exam_id UUID;
BEGIN
  SELECT "exam_id" INTO session_exam_id
  FROM "exam_sessions"
  WHERE "id" = NEW."exam_session_id" AND "school_id" = NEW."school_id";

  IF NOT FOUND OR session_exam_id <> NEW."exam_id" THEN
    RAISE EXCEPTION 'exam session must belong to the same school and exam as its dependent record'
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_participations_session_exam_consistency
  BEFORE INSERT OR UPDATE OF "school_id", "exam_id", "exam_session_id"
  ON "exam_participations" FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_session_belongs_to_exam();

CREATE TRIGGER attempt_authorizations_session_exam_consistency
  BEFORE INSERT OR UPDATE OF "school_id", "exam_id", "exam_session_id"
  ON "attempt_authorizations" FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_session_belongs_to_exam();

CREATE OR REPLACE FUNCTION enforce_attempt_authorization_consistency()
RETURNS TRIGGER AS $$
DECLARE
  authorization_record "attempt_authorizations"%ROWTYPE;
BEGIN
  IF NEW.attempt_authorization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO authorization_record FROM "attempt_authorizations"
    WHERE id = NEW.attempt_authorization_id AND school_id = NEW.school_id;
  IF NOT FOUND
    OR authorization_record.exam_id <> NEW.exam_id
    OR authorization_record.exam_session_id <> NEW.exam_session_id
    OR authorization_record.student_profile_id <> NEW.student_profile_id
    OR authorization_record.status <> 'USED' THEN
    RAISE EXCEPTION 'attempt authorization is not a consumed authorization for this exact exam/session/student'
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_attempts_authorization_consistency
  BEFORE INSERT OR UPDATE OF "attempt_authorization_id", "exam_id", "exam_session_id", "student_profile_id"
  ON "exam_attempts" FOR EACH ROW EXECUTE FUNCTION enforce_attempt_authorization_consistency();

CREATE OR REPLACE FUNCTION enforce_exam_attempt_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('INVALIDATED', 'CANCELLED') THEN
    RAISE EXCEPTION 'exam_attempt % is terminal (state=%) — no further transitions.', OLD.id, OLD.state USING ERRCODE = '23000';
  END IF;
  IF NEW.state = 'INVALIDATED'
     OR (OLD.state = 'IN_PROGRESS' AND NEW.state IN ('SUBMITTED', 'AUTO_SUBMITTED', 'CANCELLED')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'exam_attempt % cannot transition from % to %.', OLD.id, OLD.state, NEW.state USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION void_result_for_terminal_attempt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state IN ('INVALIDATED', 'CANCELLED') AND OLD.state IS DISTINCT FROM NEW.state THEN
    UPDATE "results" SET "state" = 'VOIDED' WHERE "school_id" = NEW.school_id AND "attempt_id" = NEW.id AND "state" <> 'VOIDED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_attempts_void_result_on_terminal_invalidation
  AFTER UPDATE OF "state" ON "exam_attempts" FOR EACH ROW
  EXECUTE FUNCTION void_result_for_terminal_attempt();

-- A stale marking job must never create or revive a score for an invalidated
-- or cancelled attempt. The attempt trigger above handles an existing result;
-- this guard also covers the race where invalidation wins before marking first
-- creates the result row.
CREATE OR REPLACE FUNCTION enforce_result_matches_attempt_state()
RETURNS TRIGGER AS $$
DECLARE
  parent_state "AttemptState";
BEGIN
  IF NEW.state = 'VOIDED' THEN
    RETURN NEW;
  END IF;

  SELECT state INTO parent_state
  FROM "exam_attempts"
  WHERE id = NEW.attempt_id AND school_id = NEW.school_id;

  IF parent_state IN ('INVALIDATED', 'CANCELLED') THEN
    RAISE EXCEPTION 'result for terminal attempt % must remain VOIDED', NEW.attempt_id
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER results_require_nonterminal_attempt
  BEFORE INSERT OR UPDATE OF "state" ON "results" FOR EACH ROW
  EXECUTE FUNCTION enforce_result_matches_attempt_state();

CREATE OR REPLACE FUNCTION enforce_attempt_authorization_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'USED' THEN
    IF NEW.status <> 'USED' OR NEW.used_at IS DISTINCT FROM OLD.used_at THEN
      RAISE EXCEPTION 'used attempt authorization % is immutable', OLD.id USING ERRCODE = '23000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('REVOKED', 'EXPIRED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'attempt authorization % is terminal (status=%)', OLD.id, OLD.status USING ERRCODE = '23000';
  END IF;

  IF OLD.status = 'AUTHORIZED' AND NEW.status <> 'AUTHORIZED' THEN
    IF NEW.status = 'USED' AND NEW.used_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'REVOKED' AND NEW.revoked_at IS NOT NULL AND NEW.revoked_by_membership_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'EXPIRED' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'attempt authorization % has an invalid state transition', OLD.id USING ERRCODE = '23000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_authorizations_state_transition_guard
  BEFORE UPDATE OF "status", "used_at", "revoked_at", "revoked_by_membership_id"
  ON "attempt_authorizations" FOR EACH ROW
  EXECUTE FUNCTION enforce_attempt_authorization_state_transition();

ALTER TABLE "attempt_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_authorizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_authorizations_isolation" ON "attempt_authorizations"
  USING (school_id::text = current_setting('app.current_school_id', true));
