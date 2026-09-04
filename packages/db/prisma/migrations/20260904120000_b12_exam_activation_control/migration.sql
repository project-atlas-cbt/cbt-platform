-- CreateEnum
CREATE TYPE "ExamSessionType" AS ENUM ('STANDARD', 'BATCH', 'MAKEUP', 'SPECIAL');

-- CreateEnum
CREATE TYPE "ExamSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExamSessionParticipantStatus" AS ENUM ('AUTHORIZED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ExamParticipationStatus" AS ENUM ('ABSENT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExamAdministratorStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "session_type" "ExamSessionType" NOT NULL DEFAULT 'STANDARD',
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by_membership_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_membership_id" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_session_participants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_session_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "status" "ExamSessionParticipantStatus" NOT NULL DEFAULT 'AUTHORIZED',
    "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_by_membership_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_membership_id" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_participations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "exam_session_id" UUID,
    "student_profile_id" UUID NOT NULL,
    "status" "ExamParticipationStatus" NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by_membership_id" UUID NOT NULL,
    "reason" TEXT,

    CONSTRAINT "exam_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_administrators" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "status" "ExamAdministratorStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_membership_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "exam_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_sessions_school_id_idx" ON "exam_sessions"("school_id");

-- CreateIndex
CREATE INDEX "exam_sessions_school_id_exam_id_idx" ON "exam_sessions"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_sessions_school_id_exam_id_status_idx" ON "exam_sessions"("school_id", "exam_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_school_id_id_key" ON "exam_sessions"("school_id", "id");

-- CreateIndex
CREATE INDEX "exam_session_participants_school_id_idx" ON "exam_session_participants"("school_id");

-- CreateIndex
CREATE INDEX "exam_session_participants_school_id_exam_session_id_idx" ON "exam_session_participants"("school_id", "exam_session_id");

-- CreateIndex
CREATE INDEX "exam_session_participants_school_id_exam_session_id_status_idx" ON "exam_session_participants"("school_id", "exam_session_id", "status");

-- CreateIndex
CREATE INDEX "exam_session_participants_school_id_student_profile_id_idx" ON "exam_session_participants"("school_id", "student_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_session_participants_school_id_exam_session_id_studen_key" ON "exam_session_participants"("school_id", "exam_session_id", "student_profile_id");

-- CreateIndex
CREATE INDEX "exam_participations_school_id_idx" ON "exam_participations"("school_id");

-- CreateIndex
CREATE INDEX "exam_participations_school_id_exam_id_idx" ON "exam_participations"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_participations_school_id_exam_session_id_idx" ON "exam_participations"("school_id", "exam_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_participations_school_id_exam_id_student_profile_id_key" ON "exam_participations"("school_id", "exam_id", "student_profile_id");

-- CreateIndex
CREATE INDEX "exam_administrators_school_id_idx" ON "exam_administrators"("school_id");

-- CreateIndex
CREATE INDEX "exam_administrators_school_id_exam_id_idx" ON "exam_administrators"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_administrators_school_id_membership_id_idx" ON "exam_administrators"("school_id", "membership_id");

-- AddForeignKey
-- Restrict, not Cascade: an exam past READY must never be hard-deletable
-- while it has sessions — ExamService.deleteDraft() already only permits
-- DRAFT exams, which structurally can never have one.
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_participants" ADD CONSTRAINT "exam_session_participants_school_id_exam_session_id_fkey" FOREIGN KEY ("school_id", "exam_session_id") REFERENCES "exam_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_session_participants" ADD CONSTRAINT "exam_session_participants_school_id_student_profile_id_fkey" FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_school_id_student_profile_id_fkey" FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_administrators" ADD CONSTRAINT "exam_administrators_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_administrators" ADD CONSTRAINT "exam_administrators_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written additions beyond what the Prisma schema DSL alone generates
-- — same convention as every prior phase's own hand-written RLS/trigger
-- blocks (most recently B9's/B11's).

-- RLS (ADR-0023): all four new tables are school-owned, same as every other
-- table in this domain since B0's bootstrap migration.
ALTER TABLE "exam_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_sessions_isolation" ON "exam_sessions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_session_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_session_participants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_session_participants_isolation" ON "exam_session_participants"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_participations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_participations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_participations_isolation" ON "exam_participations"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_administrators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_administrators" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_administrators_isolation" ON "exam_administrators"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- ADR-0012/M-15: "at most one ACTIVE delegation per (exam, membership)" —
-- a partial unique index, not a plain @@unique, so re-delegating the same
-- membership after a prior revocation stays possible. Same idiom as
-- StudentEnrollment's/TeacherAssignment's own B6 precedent.
CREATE UNIQUE INDEX "exam_administrators_active_unique"
  ON "exam_administrators" ("school_id", "exam_id", "membership_id")
  WHERE "status" = 'ACTIVE';

-- Confirmed product decision (2026-09-04): multiple ExamSession rows may be
-- OPEN simultaneously for one exam (parallel labs) — no "one session at a
-- time" constraint is added here. This trigger only enforces the session's
-- OWN state machine is never violated even by a direct write, complementing
-- (not replacing) the service-layer conditional `updateMany` guard every
-- transition also uses (mirrors exam.service.ts's own established idiom).
-- COMPLETED and CANCELLED are terminal — no transition out of either.
CREATE OR REPLACE FUNCTION enforce_exam_session_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION
      'exam_session % is terminal (status=%) — no further transitions.',
      OLD.id, OLD.status
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_sessions_status_transition_guard
  BEFORE UPDATE OF status ON "exam_sessions"
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_exam_session_status_transition();
