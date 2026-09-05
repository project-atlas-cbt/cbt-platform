-- CreateEnum
CREATE TYPE "AttemptQuestionCorrectness" AS ENUM ('CORRECT', 'INCORRECT', 'UNANSWERED', 'PARTIAL');

-- CreateTable
CREATE TABLE "attempt_question_results" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "correctness" "AttemptQuestionCorrectness" NOT NULL,
    "awarded_marks" INTEGER NOT NULL,
    "maximum_marks" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempt_question_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_question_results_school_id_idx" ON "attempt_question_results"("school_id");

-- CreateIndex
CREATE INDEX "attempt_question_results_school_id_attempt_id_idx" ON "attempt_question_results"("school_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_question_results_school_id_attempt_id_exam_question_key" ON "attempt_question_results"("school_id", "attempt_id", "exam_question_id");

-- AddForeignKey
ALTER TABLE "attempt_question_results" ADD CONSTRAINT "attempt_question_results_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what the Prisma schema DSL alone generates
-- — same convention as every prior phase's own hand-written RLS/trigger/
-- index blocks (most recently B12's/B13's).

-- RLS (ADR-0023): school-owned, same as every other table in this domain
-- since B0's bootstrap migration.
ALTER TABLE "attempt_question_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_question_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY "attempt_question_results_isolation" ON "attempt_question_results"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- ADR-0004's sweeper index: attempts by state and expires_at, school-scoped
-- (leading school_id) to match every other index on this table — the
-- sweeper itself iterates one school at a time via withTenant, never a
-- global cross-school scan (RLS/FORCE ROW LEVEL SECURITY blocks that
-- unconditionally, the same constraint every prior sweep in this codebase
-- already documents). A plain (expires_at) index without the school_id
-- lead would not match this access pattern.
CREATE INDEX "exam_attempts_in_progress_school_expires_at_idx"
  ON "exam_attempts" ("school_id", "expires_at")
  WHERE "state" = 'IN_PROGRESS';

-- B14: a genuinely different trigger idiom from B13's three (immutability-
-- style: block a write unconditionally, or once a parent leaves a specific
-- state). This one blocks a write only WHILE the parent attempt is still
-- IN_PROGRESS — the DB-level backstop for "attempt finalisation must be
-- durable before any downstream marking worker runs" (roadmap's own B14
-- Scope text). It never blocks for any other reason: once the parent
-- attempt has left IN_PROGRESS, re-marking (an INSERT via upsert, or an
-- UPDATE of an existing row) is always a legitimate, expected overwrite —
-- unlike AttemptAnswer/AttemptAnswerEvent/AttemptQuestionSnapshot, this
-- table carries no unconditional or "once submitted" immutability trigger
-- at all, since a re-queued marking job upserting byte-identical output
-- from the same frozen inputs is the whole point of DoD item 9
-- (idempotent, not merely safe-to-retry).
CREATE OR REPLACE FUNCTION enforce_attempt_question_result_requires_finalized_attempt()
RETURNS TRIGGER AS $$
DECLARE
  parent_state "AttemptState";
BEGIN
  SELECT state INTO parent_state FROM exam_attempts WHERE id = NEW.attempt_id;

  IF parent_state = 'IN_PROGRESS' THEN
    RAISE EXCEPTION
      'attempt_question_results for exam_attempt % cannot be written while still IN_PROGRESS.',
      NEW.attempt_id
      USING ERRCODE = '23000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attempt_question_results_require_finalized_attempt
  BEFORE INSERT OR UPDATE ON "attempt_question_results"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_attempt_question_result_requires_finalized_attempt();
