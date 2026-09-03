-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'READY', 'OPEN', 'CLOSED', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExamAccessMode" AS ENUM ('OPEN_TO_ELIGIBLE', 'EXPLICIT_AUTHORIZATION');

-- CreateEnum
CREATE TYPE "ExamNavigationPolicy" AS ENUM ('FREE', 'SEQUENTIAL_NO_REVISIT', 'SEQUENTIAL_WITH_REVISIT');

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "academic_term_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "department_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "exam_type" VARCHAR(64) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "attempt_limit" INTEGER NOT NULL DEFAULT 1,
    "navigation_policy" "ExamNavigationPolicy" NOT NULL DEFAULT 'FREE',
    "randomize_questions" BOOLEAN NOT NULL DEFAULT false,
    "randomize_options" BOOLEAN NOT NULL DEFAULT false,
    "result_policy" "ResultPolicy" NOT NULL,
    "result_detail_visibility" "ResultDetailVisibility" NOT NULL,
    "access_mode" "ExamAccessMode" NOT NULL DEFAULT 'OPEN_TO_ELIGIBLE',
    "general_instructions" TEXT,
    "navigation_instructions" TEXT,
    "submission_instructions" TEXT,
    "accommodations" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_membership_id" UUID NOT NULL,
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_membership_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_classes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "title" VARCHAR(128) NOT NULL DEFAULT 'Main Section',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "exam_section_id" UUID NOT NULL,
    "question_revision_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "marks" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_school_id_idx" ON "exams"("school_id");

-- CreateIndex
CREATE INDEX "exams_school_id_status_idx" ON "exams"("school_id", "status");

-- CreateIndex
CREATE INDEX "exams_school_id_academic_session_id_idx" ON "exams"("school_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "exams_school_id_academic_term_id_idx" ON "exams"("school_id", "academic_term_id");

-- CreateIndex
CREATE INDEX "exams_school_id_subject_id_idx" ON "exams"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "exams_school_id_department_id_idx" ON "exams"("school_id", "department_id");

-- CreateIndex
CREATE INDEX "exams_school_id_created_by_membership_id_idx" ON "exams"("school_id", "created_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_school_id_id_key" ON "exams"("school_id", "id");

-- CreateIndex
CREATE INDEX "exam_classes_school_id_idx" ON "exam_classes"("school_id");

-- CreateIndex
CREATE INDEX "exam_classes_school_id_exam_id_idx" ON "exam_classes"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_classes_school_id_class_subject_id_idx" ON "exam_classes"("school_id", "class_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_classes_school_id_exam_id_class_subject_id_key" ON "exam_classes"("school_id", "exam_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "exam_sections_school_id_idx" ON "exam_sections"("school_id");

-- CreateIndex
CREATE INDEX "exam_sections_school_id_exam_id_idx" ON "exam_sections"("school_id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sections_school_id_exam_id_sequence_key" ON "exam_sections"("school_id", "exam_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sections_school_id_id_key" ON "exam_sections"("school_id", "id");

-- CreateIndex
CREATE INDEX "exam_questions_school_id_idx" ON "exam_questions"("school_id");

-- CreateIndex
CREATE INDEX "exam_questions_school_id_exam_id_idx" ON "exam_questions"("school_id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_questions_school_id_question_revision_id_idx" ON "exam_questions"("school_id", "question_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_school_id_exam_id_question_revision_id_key" ON "exam_questions"("school_id", "exam_id", "question_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_school_id_exam_section_id_sequence_key" ON "exam_questions"("school_id", "exam_section_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_school_id_id_key" ON "academic_terms"("school_id", "id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_academic_term_id_fkey" FOREIGN KEY ("school_id", "academic_term_id") REFERENCES "academic_terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_created_by_membership_id_fkey" FOREIGN KEY ("school_id", "created_by_membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_classes" ADD CONSTRAINT "exam_classes_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_classes" ADD CONSTRAINT "exam_classes_school_id_class_subject_id_fkey" FOREIGN KEY ("school_id", "class_subject_id") REFERENCES "class_subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_school_id_exam_section_id_fkey" FOREIGN KEY ("school_id", "exam_section_id") REFERENCES "exam_sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_school_id_question_revision_id_fkey" FOREIGN KEY ("school_id", "question_revision_id") REFERENCES "question_revisions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as every prior phase's own
-- hand-written RLS/trigger blocks (most recently B9's).

-- RLS (ADR-0023): all four new tables are school-owned, same as every other
-- table in this domain since B0's bootstrap migration.
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exams" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exams_isolation" ON "exams"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_classes_isolation" ON "exam_classes"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_sections_isolation" ON "exam_sections"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "exam_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_questions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_questions_isolation" ON "exam_questions"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- B11 DoD item 2 ("selecting an unapproved revision is refused by the API
-- AND by database constraint... even by direct insert"). Mirrors B8's own
-- question_options/question_media trigger idiom, adapted to look up the
-- REFERENCED revision's status (not the row's own parent's status) — an
-- exam_questions row has no "parent" whose status this checks; it checks
-- the revision it is about to bind.
CREATE OR REPLACE FUNCTION enforce_exam_question_revision_approved()
RETURNS TRIGGER AS $$
DECLARE
  revision_status "QuestionRevisionStatus";
BEGIN
  SELECT status INTO revision_status
    FROM question_revisions
    WHERE id = NEW.question_revision_id;

  IF revision_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION
      'exam_questions may only bind an APPROVED question_revisions row (got %) — B11 DoD item 2.',
      revision_status
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_questions_require_approved_revision
  BEFORE INSERT OR UPDATE OF question_revision_id ON "exam_questions"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_question_revision_approved();

-- B11 DoD item 6 ("a READY exam's questions and configuration are
-- immutable"). Two child-table triggers mirroring B8's
-- question_options/question_media parent-status-lookup pattern exactly
-- (blocks ANY insert/update/delete once the parent Exam has left DRAFT —
-- note the check is the inverse of B8's own: B8 blocks once APPROVED, this
-- blocks once NOT DRAFT).
CREATE OR REPLACE FUNCTION enforce_exam_question_immutable_after_draft()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "ExamStatus";
  target_exam_id UUID := COALESCE(NEW.exam_id, OLD.exam_id);
BEGIN
  SELECT status INTO parent_status FROM exams WHERE id = target_exam_id;

  -- parent_status IS NULL means the parent `exams` row no longer exists —
  -- reachable only when this fires as part of a CASCADE delete of the exam
  -- itself (ExamService.deleteDraft() et al.), never for an ordinary
  -- INSERT/UPDATE/standalone DELETE, since those always target a row whose
  -- parent still exists. Treating NULL as "allow" is what lets a DRAFT
  -- exam's own deletion cascade correctly; a direct mutation of this child
  -- row while the parent genuinely still exists and is non-DRAFT is still
  -- blocked exactly as before.
  IF parent_status IS NOT NULL AND parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION
      'exam_questions for exam % are locked once the exam leaves DRAFT (status=%) — % is rejected (B11 DoD item 6).',
      target_exam_id, parent_status, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_questions_immutable_after_draft
  BEFORE INSERT OR UPDATE OR DELETE ON "exam_questions"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_question_immutable_after_draft();

CREATE OR REPLACE FUNCTION enforce_exam_class_immutable_after_draft()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "ExamStatus";
  target_exam_id UUID := COALESCE(NEW.exam_id, OLD.exam_id);
BEGIN
  SELECT status INTO parent_status FROM exams WHERE id = target_exam_id;

  -- See enforce_exam_question_immutable_after_draft's own comment above —
  -- NULL means the parent `exams` row is being deleted in this same
  -- cascade (allow); a direct mutation while the parent still exists and
  -- is non-DRAFT stays blocked exactly as before.
  IF parent_status IS NOT NULL AND parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION
      'exam_classes for exam % are locked once the exam leaves DRAFT (status=%) — % is rejected (B11 DoD item 6).',
      target_exam_id, parent_status, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_classes_immutable_after_draft
  BEFORE INSERT OR UPDATE OR DELETE ON "exam_classes"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_class_immutable_after_draft();

-- The `exams` row itself still needs UPDATE for status-only transitions
-- past DRAFT (READY→CANCELLED, READY→ARCHIVED, etc.), so this is a
-- column-diff trigger, not a blanket freeze like the two above — it only
-- rejects an UPDATE that changes a configuration/identity column while
-- OLD.status is already not DRAFT.
CREATE OR REPLACE FUNCTION enforce_exam_configuration_immutable_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'DRAFT' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.exam_type IS DISTINCT FROM OLD.exam_type
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.academic_session_id IS DISTINCT FROM OLD.academic_session_id
      OR NEW.academic_term_id IS DISTINCT FROM OLD.academic_term_id
      OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
      OR NEW.attempt_limit IS DISTINCT FROM OLD.attempt_limit
      OR NEW.navigation_policy IS DISTINCT FROM OLD.navigation_policy
      OR NEW.randomize_questions IS DISTINCT FROM OLD.randomize_questions
      OR NEW.randomize_options IS DISTINCT FROM OLD.randomize_options
      OR NEW.result_policy IS DISTINCT FROM OLD.result_policy
      OR NEW.result_detail_visibility IS DISTINCT FROM OLD.result_detail_visibility
      OR NEW.access_mode IS DISTINCT FROM OLD.access_mode
      OR NEW.general_instructions IS DISTINCT FROM OLD.general_instructions
      OR NEW.navigation_instructions IS DISTINCT FROM OLD.navigation_instructions
      OR NEW.submission_instructions IS DISTINCT FROM OLD.submission_instructions
      OR NEW.accommodations IS DISTINCT FROM OLD.accommodations
    THEN
      RAISE EXCEPTION
        'exam % configuration is locked once the exam leaves DRAFT (status=%) — B11 DoD item 6.',
        OLD.id, OLD.status
        USING ERRCODE = '23000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exams_configuration_immutable_after_draft
  BEFORE UPDATE ON "exams"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_exam_configuration_immutable_after_draft();
