-- B16: participation is per sitting; incomplete remains a derived classification.
ALTER TYPE "ExamParticipationStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'ABSENT';
ALTER TYPE "ExamParticipationStatus" ADD VALUE IF NOT EXISTS 'ATTENDED' BEFORE 'COMPLETED';
ALTER TABLE "exam_participations" DROP CONSTRAINT IF EXISTS "exam_participations_school_id_exam_id_student_profile_id_key";
ALTER TABLE "exam_participations" ALTER COLUMN "exam_session_id" SET NOT NULL;
ALTER TABLE "exam_participations" ALTER COLUMN "marked_by_membership_id" DROP NOT NULL;
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_school_session_fkey" FOREIGN KEY ("school_id","exam_session_id") REFERENCES "exam_sessions"("school_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_school_id_id_key" UNIQUE ("school_id","id");
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
 CONSTRAINT "attempt_authorizations_school_attempt_fkey" FOREIGN KEY ("school_id","used_by_attempt_id") REFERENCES "exam_attempts"("school_id","id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT "attempt_authorizations_authorized_by_membership_fkey" FOREIGN KEY ("school_id","authorized_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT,
 CONSTRAINT "attempt_authorizations_revoked_by_membership_fkey" FOREIGN KEY ("school_id","revoked_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT,
 CONSTRAINT "attempt_authorizations_expiry_after_authorization" CHECK ("expires_at" IS NULL OR "expires_at">"authorized_at"),
 CONSTRAINT "attempt_authorizations_used_shape" CHECK (("status"='USED')=("used_at" IS NOT NULL AND "used_by_attempt_id" IS NOT NULL)),
 CONSTRAINT "attempt_authorizations_revoked_shape" CHECK (("status"='REVOKED')=("revoked_at" IS NOT NULL AND "revoked_by_membership_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "attempt_authorizations_used_attempt_key" ON "attempt_authorizations"("used_by_attempt_id") WHERE "used_by_attempt_id" IS NOT NULL;
CREATE UNIQUE INDEX "attempt_authorizations_one_active_key" ON "attempt_authorizations"("school_id","exam_id","student_profile_id","type") WHERE "status"='AUTHORIZED';
CREATE INDEX "attempt_authorizations_lookup_idx" ON "attempt_authorizations"("school_id","exam_id","student_profile_id","status");
ALTER TABLE "attempt_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_authorizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_authorizations_tenant_isolation" ON "attempt_authorizations" USING ("school_id"=NULLIF(current_setting('app.current_school_id',true),'')::uuid) WITH CHECK ("school_id"=NULLIF(current_setting('app.current_school_id',true),'')::uuid);
