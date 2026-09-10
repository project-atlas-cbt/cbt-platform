-- CreateEnum
CREATE TYPE "ResultState" AS ENUM ('PROCESSING', 'FINAL', 'ADJUSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ResultPublicationStatus" AS ENUM ('PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "ResultAdjustmentType" AS ENUM ('VOID_QUESTION', 'AWARD_MARK', 'DEDUCT_MARK', 'RECALCULATE', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ResultAdjustmentOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "state" "ResultState" NOT NULL DEFAULT 'PROCESSING',
    "total_marks" INTEGER NOT NULL,
    "earned_marks" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "incorrect_count" INTEGER NOT NULL,
    "unanswered_count" INTEGER NOT NULL,
    "partial_count" INTEGER NOT NULL,
    "grade" VARCHAR(16),
    "grading_scale_version_id" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "withheld" BOOLEAN NOT NULL DEFAULT false,
    "withheld_reason" TEXT,
    "withheld_by_membership_id" UUID,
    "withheld_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "status" "ResultPublicationStatus" NOT NULL DEFAULT 'UNPUBLISHED',
    "published_by_membership_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "unpublished_by_membership_id" UUID,
    "unpublished_at" TIMESTAMPTZ(6),
    "adjustment_in_progress" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_adjustment_operations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "type" "ResultAdjustmentType" NOT NULL,
    "status" "ResultAdjustmentOperationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "target_exam_question_id" UUID,
    "mark_delta" INTEGER,
    "target_result_id" UUID,
    "override_earned_marks" INTEGER,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "applied_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "created_by_membership_id" UUID NOT NULL,
    "processing_claimed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "result_adjustment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_adjustments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "adjustment_type" "ResultAdjustmentType" NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "authorized_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "level" "ClassLevel",
    "current_version_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scale_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_scale_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scale_bands" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "label" VARCHAR(16) NOT NULL,
    "min_percentage" DECIMAL(5,2) NOT NULL,
    "max_percentage" DECIMAL(5,2) NOT NULL,
    "is_passing" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_scale_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "results_school_id_idx" ON "results"("school_id");

-- CreateIndex
CREATE INDEX "results_school_id_exam_id_state_idx" ON "results"("school_id", "exam_id", "state");

-- CreateIndex
CREATE INDEX "results_school_id_student_profile_id_state_idx" ON "results"("school_id", "student_profile_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "results_school_id_attempt_id_key" ON "results"("school_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_school_id_id_key" ON "results"("school_id", "id");

-- CreateIndex
CREATE INDEX "result_publications_school_id_idx" ON "result_publications"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_school_id_exam_id_key" ON "result_publications"("school_id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_school_id_id_key" ON "result_publications"("school_id", "id");

-- CreateIndex
CREATE INDEX "result_adjustment_operations_school_id_idx" ON "result_adjustment_operations"("school_id");

-- CreateIndex
CREATE INDEX "result_adjustment_operations_school_id_exam_id_idx" ON "result_adjustment_operations"("school_id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_adjustment_operations_school_id_id_key" ON "result_adjustment_operations"("school_id", "id");

-- CreateIndex
CREATE INDEX "result_adjustments_school_id_idx" ON "result_adjustments"("school_id");

-- CreateIndex
CREATE INDEX "result_adjustments_school_id_result_id_idx" ON "result_adjustments"("school_id", "result_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_adjustments_school_id_operation_id_result_id_key" ON "result_adjustments"("school_id", "operation_id", "result_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_current_version_id_key" ON "grading_scales"("current_version_id");

-- CreateIndex
CREATE INDEX "grading_scales_school_id_idx" ON "grading_scales"("school_id");

-- CreateIndex
CREATE INDEX "grading_scales_school_id_level_idx" ON "grading_scales"("school_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_school_id_id_key" ON "grading_scales"("school_id", "id");

-- CreateIndex
CREATE INDEX "grading_scale_versions_school_id_idx" ON "grading_scale_versions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_versions_school_id_scale_id_version_number_key" ON "grading_scale_versions"("school_id", "scale_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_versions_school_id_id_key" ON "grading_scale_versions"("school_id", "id");

-- CreateIndex
CREATE INDEX "grading_scale_bands_school_id_idx" ON "grading_scale_bands"("school_id");

-- CreateIndex
CREATE INDEX "grading_scale_bands_school_id_version_id_idx" ON "grading_scale_bands"("school_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scale_bands_school_id_version_id_sort_order_key" ON "grading_scale_bands"("school_id", "version_id", "sort_order");

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_school_id_attempt_id_fkey" FOREIGN KEY ("school_id", "attempt_id") REFERENCES "exam_attempts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_school_id_student_profile_id_fkey" FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_school_id_grading_scale_version_id_fkey" FOREIGN KEY ("school_id", "grading_scale_version_id") REFERENCES "grading_scale_versions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_adjustment_operations" ADD CONSTRAINT "result_adjustment_operations_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_adjustments" ADD CONSTRAINT "result_adjustments_school_id_operation_id_fkey" FOREIGN KEY ("school_id", "operation_id") REFERENCES "result_adjustment_operations"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_adjustments" ADD CONSTRAINT "result_adjustments_school_id_result_id_fkey" FOREIGN KEY ("school_id", "result_id") REFERENCES "results"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "grading_scale_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scale_versions" ADD CONSTRAINT "grading_scale_versions_school_id_scale_id_fkey" FOREIGN KEY ("school_id", "scale_id") REFERENCES "grading_scales"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scale_bands" ADD CONSTRAINT "grading_scale_bands_school_id_version_id_fkey" FOREIGN KEY ("school_id", "version_id") REFERENCES "grading_scale_versions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written additions beyond what the Prisma schema DSL alone generates —
-- same convention as every prior phase's own RLS/trigger/index blocks (most
-- recently B13's and B14's).
-- ---------------------------------------------------------------------------

-- RLS (ADR-0023): every one of these tables is school-owned, so each gets the
-- identical ENABLE + FORCE + isolation-policy treatment every school-owned
-- table has had since B0's bootstrap migration.
ALTER TABLE "results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "results" FORCE ROW LEVEL SECURITY;
CREATE POLICY "results_isolation" ON "results"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "result_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_publications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "result_publications_isolation" ON "result_publications"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "result_adjustment_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_adjustment_operations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "result_adjustment_operations_isolation" ON "result_adjustment_operations"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "result_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "result_adjustments_isolation" ON "result_adjustments"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "grading_scales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_scales" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grading_scales_isolation" ON "grading_scales"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "grading_scale_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_scale_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grading_scale_versions_isolation" ON "grading_scale_versions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "grading_scale_bands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_scale_bands" FORCE ROW LEVEL SECURITY;
CREATE POLICY "grading_scale_bands_isolation" ON "grading_scale_bands"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- 07 §10.2: "A result adjustment is an event, not a silent overwrite."
-- Unconditionally immutable from the moment a row is created — B9's
-- question_reviews idiom, not B8's parent-status-gated one: unlike a question
-- revision (mutable while DRAFT), an adjustment record is never legitimately
-- edited or removed at any point in its life, which is precisely what makes
-- DoD item 12's replay-to-reproduce-the-original guarantee trustworthy.
CREATE OR REPLACE FUNCTION enforce_result_adjustment_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'result_adjustments are append-only: % on result_adjustment % is not permitted.',
    TG_OP, OLD.id
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER result_adjustments_immutable
  BEFORE UPDATE OR DELETE ON "result_adjustments"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_result_adjustment_immutable();

-- ADR-0010's reduced marking lifecycle, enforced at the database level rather
-- than only in the service layer (B12's exam_sessions_status_transition_guard
-- idiom). PROCESSING → FINAL → ADJUSTED, with VOIDED reachable from any
-- non-terminal state and terminal once reached (ADR-0025: a voided result is
-- retained in full, never revived, never deleted).
--
-- A state-preserving UPDATE always passes: withholding/releasing a result and
-- re-adjusting an already-ADJUSTED one are both legitimate, expected writes.
CREATE OR REPLACE FUNCTION enforce_result_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  IF OLD.state = 'VOIDED' THEN
    RAISE EXCEPTION
      'result % is VOIDED and cannot transition to %.', OLD.id, NEW.state
      USING ERRCODE = '23000';
  END IF;

  IF NEW.state = 'VOIDED'
     OR (OLD.state = 'PROCESSING' AND NEW.state = 'FINAL')
     OR (OLD.state = 'FINAL' AND NEW.state = 'ADJUSTED') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'result % cannot transition from % to %.', OLD.id, OLD.state, NEW.state
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER results_state_transition_guard
  BEFORE UPDATE OF state ON "results"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_result_state_transition();

-- ADR-0018: "Editing a scale creates a new version; bands are never mutated
-- in place." The FK from results.grading_scale_version_id is already
-- ON DELETE RESTRICT, so a version that graded a result cannot be deleted —
-- but nothing stopped its BANDS being edited underneath it, which would
-- silently rewrite the meaning of every historical grade frozen against it
-- (07 §42 invariant 13, the exact failure M-06 exists to prevent).
--
-- Deliberately conditional, not unconditional: a version nothing has been
-- graded against yet is still freely editable, which is what makes authoring
-- a scale before any exam is marked a normal, non-versioning-churn workflow.
CREATE OR REPLACE FUNCTION enforce_grading_scale_band_frozen_once_used()
RETURNS TRIGGER AS $$
DECLARE
  target_version_id UUID;
  used_count INT;
BEGIN
  target_version_id := COALESCE(NEW.version_id, OLD.version_id);

  SELECT count(*) INTO used_count
  FROM results
  WHERE grading_scale_version_id = target_version_id;

  IF used_count > 0 THEN
    RAISE EXCEPTION
      'grading scale version % has graded % result(s) and its bands are frozen; create a new version instead.',
      target_version_id, used_count
      USING ERRCODE = '23000';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grading_scale_bands_frozen_once_used
  BEFORE INSERT OR UPDATE OR DELETE ON "grading_scale_bands"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_grading_scale_band_frozen_once_used();

-- At most one ACTIVE grading scale per level scope (including the
-- school-wide default, where level IS NULL). Two active scales covering the
-- same scope would make grade resolution ambiguous — it would decide real
-- students' grades by row order — so the service versions an existing scale
-- rather than creating a rival, and this backstops that at the database
-- level. Two partial indexes rather than one, because NULL is not equal to
-- itself in a unique index: the second covers exactly the default-scope case
-- the first cannot.
CREATE UNIQUE INDEX "grading_scales_one_active_per_level"
  ON "grading_scales" ("school_id", "level")
  WHERE "archived_at" IS NULL AND "level" IS NOT NULL;

CREATE UNIQUE INDEX "grading_scales_one_active_school_default"
  ON "grading_scales" ("school_id")
  WHERE "archived_at" IS NULL AND "level" IS NULL;
