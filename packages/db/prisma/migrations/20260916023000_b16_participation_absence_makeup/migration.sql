-- B16: participation is per sitting; incomplete remains a derived classification.
ALTER TYPE "ExamParticipationStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ABSENT';
ALTER TYPE "ExamParticipationStatus" ADD VALUE IF NOT EXISTS 'ATTENDED' BEFORE 'COMPLETED';
ALTER TABLE "exam_participations" DROP CONSTRAINT IF EXISTS "exam_participations_school_id_exam_id_student_profile_id_key";
ALTER TABLE "exam_participations" ALTER COLUMN "exam_session_id" SET NOT NULL;
ALTER TABLE "exam_participations" ALTER COLUMN "marked_by_membership_id" DROP NOT NULL;
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_school_session_fkey" FOREIGN KEY ("school_id","exam_session_id") REFERENCES "exam_sessions"("school_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "exam_participations_school_exam_session_student_key" ON "exam_participations"("school_id","exam_id","exam_session_id","student_profile_id");
CREATE INDEX "exam_participations_school_exam_status_idx" ON "exam_participations"("school_id","exam_id","status");

CREATE TYPE "AttemptAuthorizationType" AS ENUM ('MAKEUP','RETRY');
CREATE TYPE "AttemptAuthorizationStatus" AS ENUM ('AUTHORIZED','USED','REVOKED','EXPIRED');
CREATE TABLE "attempt_authorizations" (
 "id" UUID PRIMARY KEY DEFAULT uuidv7(), "school_id" UUID NOT NULL, "exam_id" UUID NOT NULL,
 "student_profile_id" UUID NOT NULL, "type" "AttemptAuthorizationType" NOT NULL,
 "status" "AttemptAuthorizationStatus" NOT NULL DEFAULT 'AUTHORIZED', "reason" TEXT NOT NULL,
 "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "authorized_by_membership_id" UUID NOT NULL,
 "expires_at" TIMESTAMPTZ(6), "used_at" TIMESTAMPTZ(6), "used_by_attempt_id" UUID,
 "revoked_at" TIMESTAMPTZ(6), "revoked_by_membership_id" UUID, "revoked_reason" TEXT,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "attempt_authorizations_school_exam_fkey" FOREIGN KEY ("school_id","exam_id") REFERENCES "exams"("school_id","id") ON DELETE RESTRICT,
 CONSTRAINT "attempt_authorizations_school_student_fkey" FOREIGN KEY ("school_id","student_profile_id") REFERENCES "student_profiles"("school_id","id") ON DELETE RESTRICT,
 CONSTRAINT "attempt_authorizations_school_attempt_fkey" FOREIGN KEY ("school_id","used_by_attempt_id") REFERENCES "exam_attempts"("school_id","id") ON DELETE RESTRICT,
 CONSTRAINT "attempt_authorizations_used_shape" CHECK (("status"='USED')=("used_at" IS NOT NULL AND "used_by_attempt_id" IS NOT NULL)),
 CONSTRAINT "attempt_authorizations_revoked_shape" CHECK (("status"='REVOKED')=("revoked_at" IS NOT NULL AND "revoked_by_membership_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "attempt_authorizations_used_attempt_key" ON "attempt_authorizations"("used_by_attempt_id") WHERE "used_by_attempt_id" IS NOT NULL;
CREATE UNIQUE INDEX "attempt_authorizations_one_active_key" ON "attempt_authorizations"("school_id","exam_id","student_profile_id","type") WHERE "status"='AUTHORIZED';
CREATE INDEX "attempt_authorizations_lookup_idx" ON "attempt_authorizations"("school_id","exam_id","student_profile_id","status");
ALTER TABLE "attempt_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_authorizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_authorizations_tenant_isolation" ON "attempt_authorizations" USING ("school_id"=NULLIF(current_setting('app.current_school_id',true),'')::uuid) WITH CHECK ("school_id"=NULLIF(current_setting('app.current_school_id',true),'')::uuid);

CREATE OR REPLACE FUNCTION enforce_exam_attempt_status_transition() RETURNS trigger AS $$ BEGIN
 IF OLD.state=NEW.state THEN RETURN NEW; END IF;
 IF OLD.state='IN_PROGRESS' AND NEW.state IN ('SUBMITTED','AUTO_SUBMITTED','INVALIDATED','CANCELLED') THEN RETURN NEW; END IF;
 IF OLD.state IN ('SUBMITTED','AUTO_SUBMITTED') AND NEW.state='INVALIDATED' THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Invalid exam attempt state transition: % -> %',OLD.state,NEW.state;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION b16_attempt_insert() RETURNS trigger AS $$ DECLARE auth_id uuid; auth_type "AttemptAuthorizationType"; BEGIN
 SELECT id,type INTO auth_id,auth_type FROM attempt_authorizations WHERE school_id=NEW.school_id AND exam_id=NEW.exam_id AND student_profile_id=NEW.student_profile_id AND status='AUTHORIZED' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) ORDER BY authorized_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF auth_id IS NOT NULL THEN
  NEW.attempt_type:=auth_type::text::"AttemptType";
  UPDATE attempt_authorizations SET status='USED',used_at=CURRENT_TIMESTAMP,used_by_attempt_id=NEW.id,updated_at=CURRENT_TIMESTAMP WHERE id=auth_id;
 END IF;
 INSERT INTO exam_participations(school_id,exam_id,exam_session_id,student_profile_id,status) VALUES(NEW.school_id,NEW.exam_id,NEW.exam_session_id,NEW.student_profile_id,'ATTENDED') ON CONFLICT(school_id,exam_id,exam_session_id,student_profile_id) DO UPDATE SET status='ATTENDED',marked_at=CURRENT_TIMESTAMP,marked_by_membership_id=NULL,reason=NULL;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_attempts_b16_insert" BEFORE INSERT ON "exam_attempts" FOR EACH ROW EXECUTE FUNCTION b16_attempt_insert();

CREATE OR REPLACE FUNCTION b16_attempt_state() RETURNS trigger AS $$ BEGIN
 IF NEW.state IN ('SUBMITTED','AUTO_SUBMITTED') AND OLD.state IS DISTINCT FROM NEW.state THEN UPDATE exam_participations SET status='COMPLETED',marked_at=CURRENT_TIMESTAMP WHERE school_id=NEW.school_id AND exam_id=NEW.exam_id AND exam_session_id=NEW.exam_session_id AND student_profile_id=NEW.student_profile_id; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_attempts_b16_state" AFTER UPDATE OF state ON "exam_attempts" FOR EACH ROW EXECUTE FUNCTION b16_attempt_state();
