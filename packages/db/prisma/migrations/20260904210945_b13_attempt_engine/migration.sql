-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptType" AS ENUM ('STANDARD', 'MAKEUP', 'RETRY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "AttemptParticipationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttemptAnswerState" AS ENUM ('UNANSWERED', 'ANSWERED');

-- CreateEnum
CREATE TYPE "AttemptEventType" AS ENUM ('WINDOW_BLUR', 'FULLSCREEN_EXIT', 'TAB_HIDDEN', 'RECONNECTED', 'RESUMED', 'BINDING_MISMATCH');

-- AlterTable
ALTER TABLE "exam_session_participants" ADD COLUMN     "extra_time_granted_at" TIMESTAMPTZ(6),
ADD COLUMN     "extra_time_granted_by_membership_id" UUID,
ADD COLUMN     "extra_time_seconds" INTEGER;

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "exam_session_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "attempt_type" "AttemptType" NOT NULL DEFAULT 'STANDARD',
    "state" "AttemptState" NOT NULL DEFAULT 'IN_PROGRESS',
    "participation_status" "AttemptParticipationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_granted_seconds" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "invalidation_reason" TEXT,
    "invalidated_at" TIMESTAMPTZ(6),
    "invalidated_by_membership_id" UUID,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_ip_address" VARCHAR(64),
    "start_user_agent" TEXT,
    "start_device_id" UUID,
    "start_session_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_question_snapshots" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "document_version" INTEGER NOT NULL DEFAULT 1,
    "seed" VARCHAR(64) NOT NULL,
    "document" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_question_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "answer_value" JSONB,
    "state" "AttemptAnswerState" NOT NULL DEFAULT 'UNANSWERED',
    "sequence_number" INTEGER NOT NULL,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_saved_at" TIMESTAMPTZ(6) NOT NULL,
    "grade_window_flag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answer_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "selected_option_id" UUID,
    "answer_value" JSONB,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(32) NOT NULL,
    "grade_window_flag" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "rejection_reason" TEXT,

    CONSTRAINT "attempt_answer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "type" "AttemptEventType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_attempts_school_id_idx" ON "exam_attempts"("school_id");

-- CreateIndex
CREATE INDEX "exam_attempts_school_id_exam_id_idx" ON "exam_attempts"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_attempts_school_id_exam_session_id_idx" ON "exam_attempts"("school_id", "exam_session_id");

-- CreateIndex
CREATE INDEX "exam_attempts_school_id_exam_id_state_idx" ON "exam_attempts"("school_id", "exam_id", "state");

-- CreateIndex
CREATE INDEX "exam_attempts_school_id_student_profile_id_idx" ON "exam_attempts"("school_id", "student_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_school_id_id_key" ON "exam_attempts"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_school_id_exam_id_student_profile_id_attempt__key" ON "exam_attempts"("school_id", "exam_id", "student_profile_id", "attempt_number");

-- CreateIndex
CREATE INDEX "attempt_question_snapshots_school_id_idx" ON "attempt_question_snapshots"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_question_snapshots_school_id_attempt_id_key" ON "attempt_question_snapshots"("school_id", "attempt_id");

-- CreateIndex
CREATE INDEX "attempt_answers_school_id_idx" ON "attempt_answers"("school_id");

-- CreateIndex
CREATE INDEX "attempt_answers_school_id_attempt_id_idx" ON "attempt_answers"("school_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_school_id_attempt_id_exam_question_id_key" ON "attempt_answers"("school_id", "attempt_id", "exam_question_id");

-- CreateIndex
CREATE INDEX "attempt_answer_events_school_id_idx" ON "attempt_answer_events"("school_id");

-- CreateIndex
CREATE INDEX "attempt_answer_events_school_id_attempt_id_exam_question_id_idx" ON "attempt_answer_events"("school_id", "attempt_id", "exam_question_id");

-- CreateIndex
CREATE INDEX "attempt_events_school_id_idx" ON "attempt_events"("school_id");

-- CreateIndex
CREATE INDEX "attempt_events_school_id_attempt_id_idx" ON "attempt_events"("school_id", "attempt_id");

-- CreateIndex
CREATE INDEX "attempt_events_school_id_attempt_id_type_idx" ON "attempt_events"("school_id", "attempt_id", "type");

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_school_id_exam_session_id_fkey" FOREIGN KEY ("school_id", "exam_session_id") REFERENCES "exam_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_school_id_student_profile_id_fkey" FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_question_snapshots" ADD CONSTRAINT "attempt_question_snapshots_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answer_events" ADD CONSTRAINT "attempt_answer_events_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "exam_session_participants_school_id_exam_session_id_studen_key" RENAME TO "exam_session_participants_school_id_exam_session_id_student_key";

-- Hand-written additions beyond what the Prisma schema DSL alone generates
-- — same convention as every prior phase's own hand-written RLS/trigger
-- blocks (most recently B9's/B11's/B12's).

-- RLS (ADR-0023): all five new tables are school-owned, same as every other
-- table in this domain since B0's bootstrap migration.
ALTER TABLE "exam_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_attempts_isolation" ON "exam_attempts"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "attempt_question_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_question_snapshots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_question_snapshots_isolation" ON "attempt_question_snapshots"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "attempt_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_answers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_answers_isolation" ON "attempt_answers"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "attempt_answer_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_answer_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_answer_events_isolation" ON "attempt_answer_events"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "attempt_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_events_isolation" ON "attempt_events"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- D-09/X-03: at most one IN_PROGRESS attempt per (school, exam, student) —
-- a partial unique index, not a plain @@unique (a student may accumulate
-- several terminal-state attempts over time, e.g. after a future B14
-- makeup/retry authorization). Scoped per-exam, not per-session: Exam
-- .attemptLimit is exam-scoped, and B12's confirmed "multiple concurrent
-- OPEN sessions per exam" design means a session-scoped index would let a
-- student authorized under two simultaneously-open sessions of the same
-- exam start two attempts at once, silently bypassing attemptLimit. This
-- is the actual database-level guarantee behind DoD item 2 ("a duplicate
-- start... yields exactly one attempt, enforced by database constraint");
-- AttemptLifecycleService.start()'s own pg_advisory_xact_lock is what
-- keeps two racing FIRST-time starts from ever reaching this index as a
-- real conflict — see that service's own comment.
CREATE UNIQUE INDEX "exam_attempts_active_unique"
  ON "exam_attempts" ("school_id", "exam_id", "student_profile_id")
  WHERE "state" = 'IN_PROGRESS';

-- 07 §16: IN_PROGRESS is the only state anything transitions FROM.
-- SUBMITTED/AUTO_SUBMITTED/INVALIDATED/CANCELLED are all terminal — no
-- transition out of any of them. Complements (not replaces) the
-- service-layer conditional `updateMany` guard every transition also uses,
-- mirroring exam_sessions_status_transition_guard's own B12 idiom exactly.
CREATE OR REPLACE FUNCTION enforce_exam_attempt_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED', 'CANCELLED') THEN
    RAISE EXCEPTION
      'exam_attempt % is terminal (state=%) — no further transitions.',
      OLD.id, OLD.state
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_attempts_status_transition_guard
  BEFORE UPDATE OF state ON "exam_attempts"
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION enforce_exam_attempt_status_transition();

-- ADR-0008: "The document is immutable once written." Unconditional — a
-- snapshot row carries no status column of its own to gate on, and there
-- is no legitimate mutation of it ever, mirroring question_reviews' own
-- unconditional shape (B9), not B8's status-gated shape.
CREATE OR REPLACE FUNCTION enforce_attempt_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'attempt_question_snapshots row % is immutable once written — % is rejected (ADR-0008).',
    OLD.id, TG_OP
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_question_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "attempt_question_snapshots"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_attempt_snapshot_immutability();

-- ADR-0007: "Answers become immutable after submission" — gated on the
-- PARENT exam_attempts.state, since attempt_answers carries no status of
-- its own reflecting the attempt's own lifecycle. Mirrors B8's
-- enforce_question_option_immutability's parent-lookup shape exactly.
-- Guards INSERT too (a new answer row appearing after the attempt is no
-- longer IN_PROGRESS is exactly as much a violation as editing an
-- existing one) — this IS the actual database-level enforcement of "no
-- writes once not writable"; the service-layer admissibility/ordering
-- checks in front of it are the fast-fail UX layer.
CREATE OR REPLACE FUNCTION enforce_attempt_answer_immutability()
RETURNS TRIGGER AS $$
DECLARE
  parent_state "AttemptState";
  target_attempt_id UUID := COALESCE(NEW.attempt_id, OLD.attempt_id);
BEGIN
  SELECT state INTO parent_state
    FROM exam_attempts
    WHERE id = target_attempt_id;

  IF parent_state IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION
      'attempt_answers for exam_attempt % (state=%) are immutable — % is rejected (ADR-0007).',
      target_attempt_id, parent_state, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_answers_immutable_when_attempt_not_in_progress
  BEFORE INSERT OR UPDATE OR DELETE ON "attempt_answers"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_attempt_answer_immutability();

-- ADR-0007's append-only half. Unconditional, mirroring
-- question_reviews' own B9 shape — not B10's audit_events grant-REVOKE
-- treatment, since that table's belt-and-suspenders exists specifically
-- because of a second cross-school-reading Postgres role
-- (atlas_audit_reader) this table has no analog of; an ordinary trigger is
-- simpler and equally robust for this table's actual risk profile.
CREATE OR REPLACE FUNCTION enforce_attempt_answer_event_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'attempt_answer_events row % is immutable once written — % is rejected (ADR-0007).',
    OLD.id, TG_OP
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_answer_events_immutable
  BEFORE UPDATE OR DELETE ON "attempt_answer_events"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_attempt_answer_event_immutability();
