-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionRevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "ImportJobType" ADD VALUE 'QUESTIONS';

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN     "result_question_id" UUID;

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "level" "ClassLevel" NOT NULL,
    "author_teacher_profile_id" UUID NOT NULL,
    "current_revision_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_revisions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "topic_id" UUID,
    "subtopic_id" UUID,
    "difficulty" "QuestionDifficulty" NOT NULL,
    "marks" INTEGER NOT NULL,
    "explanation" TEXT,
    "created_by_membership_id" UUID NOT NULL,
    "status" "QuestionRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "question_revision_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "original_order" INTEGER NOT NULL,
    "correct_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_media" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "question_revision_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "parent_topic_id" UUID,
    "name" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_current_revision_id_key" ON "questions"("current_revision_id");

-- CreateIndex
CREATE INDEX "questions_school_id_idx" ON "questions"("school_id");

-- CreateIndex
CREATE INDEX "questions_school_id_subject_id_level_idx" ON "questions"("school_id", "subject_id", "level");

-- CreateIndex
CREATE INDEX "questions_school_id_author_teacher_profile_id_idx" ON "questions"("school_id", "author_teacher_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_school_id_id_key" ON "questions"("school_id", "id");

-- CreateIndex
CREATE INDEX "question_revisions_school_id_idx" ON "question_revisions"("school_id");

-- CreateIndex
CREATE INDEX "question_revisions_school_id_question_id_idx" ON "question_revisions"("school_id", "question_id");

-- CreateIndex
CREATE INDEX "question_revisions_school_id_status_idx" ON "question_revisions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "question_revisions_school_id_question_id_revision_number_key" ON "question_revisions"("school_id", "question_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "question_revisions_school_id_id_key" ON "question_revisions"("school_id", "id");

-- CreateIndex
CREATE INDEX "question_options_school_id_idx" ON "question_options"("school_id");

-- CreateIndex
CREATE INDEX "question_options_school_id_question_revision_id_idx" ON "question_options"("school_id", "question_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_school_id_question_revision_id_original_or_key" ON "question_options"("school_id", "question_revision_id", "original_order");

-- CreateIndex
CREATE INDEX "question_media_school_id_idx" ON "question_media"("school_id");

-- CreateIndex
CREATE INDEX "question_media_school_id_question_revision_id_idx" ON "question_media"("school_id", "question_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_media_school_id_question_revision_id_media_asset_i_key" ON "question_media"("school_id", "question_revision_id", "media_asset_id");

-- CreateIndex
CREATE INDEX "topics_school_id_idx" ON "topics"("school_id");

-- CreateIndex
CREATE INDEX "topics_school_id_subject_id_idx" ON "topics"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "topics_school_id_parent_topic_id_idx" ON "topics"("school_id", "parent_topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_school_id_id_key" ON "topics"("school_id", "id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_author_teacher_profile_id_fkey" FOREIGN KEY ("school_id", "author_teacher_profile_id") REFERENCES "teacher_profiles"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "question_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_school_id_question_id_fkey" FOREIGN KEY ("school_id", "question_id") REFERENCES "questions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_school_id_topic_id_fkey" FOREIGN KEY ("school_id", "topic_id") REFERENCES "topics"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_school_id_subtopic_id_fkey" FOREIGN KEY ("school_id", "subtopic_id") REFERENCES "topics"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_school_id_question_revision_id_fkey" FOREIGN KEY ("school_id", "question_revision_id") REFERENCES "question_revisions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_school_id_question_revision_id_fkey" FOREIGN KEY ("school_id", "question_revision_id") REFERENCES "question_revisions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_media" ADD CONSTRAINT "question_media_school_id_media_asset_id_fkey" FOREIGN KEY ("school_id", "media_asset_id") REFERENCES "media_assets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_school_id_parent_topic_id_fkey" FOREIGN KEY ("school_id", "parent_topic_id") REFERENCES "topics"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as B2's audit_events RLS block and
-- B3's/B4's/B5's/B6's own hand-written RLS + partial/functional-index
-- blocks, extended here with this codebase's first real trigger-enforced
-- constraint.

-- RLS (ADR-0023): all 5 new tables are school-owned.
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "questions_isolation" ON "questions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "question_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_revisions_isolation" ON "question_revisions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "question_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_options" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_options_isolation" ON "question_options"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "question_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_media" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_media_isolation" ON "question_media"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "topics_isolation" ON "topics"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- ADR-0001 §3 / DoD item 9: topic names resolve case-insensitively within
-- (school, subject, parent). A plain @@unique on `name` would be case-
-- SENSITIVE ("Quadratics" and "quadratics" would both insert); Prisma's DSL
-- cannot express a functional/expression index, so it's hand-written here,
-- same convention as B5's academic_sessions_one_current_per_school. NULL
-- parent_topic_id is coalesced to a fixed sentinel UUID so top-level topics
-- (no parent) are still compared against each other for uniqueness —
-- Postgres treats two NULLs as distinct under a plain unique index, which
-- would silently allow duplicate top-level topic names otherwise.
CREATE UNIQUE INDEX "topics_school_subject_parent_name_ci"
  ON "topics" (
    "school_id",
    "subject_id",
    COALESCE("parent_topic_id", '00000000-0000-0000-0000-000000000000'::uuid),
    lower("name")
  );

-- DoD item 6 / roadmap Database work: "database-level immutability for
-- approved revisions... rejecting updates to content, options, correct
-- answer, marks, or approval fields once APPROVED." Once a question_revisions
-- row is APPROVED, ANY update or delete is rejected outright (not a
-- column-by-column allow-list) — archiving a Question never touches this
-- row (Question.archivedAt is the archive marker instead — see that
-- column's own schema doc comment), so there is no legitimate post-APPROVED
-- mutation to carve out for.
CREATE OR REPLACE FUNCTION enforce_question_revision_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION
      'question_revisions row % is APPROVED and immutable — % is rejected (B8 DoD item 6).',
      OLD.id, TG_OP
      USING ERRCODE = '23000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_revisions_immutable_when_approved
  BEFORE UPDATE OR DELETE ON "question_revisions"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_question_revision_immutability();

-- question_options rows carry no status of their own — protection is keyed
-- off the parent revision's status, guarding INSERT too (adding a new
-- option to an already-APPROVED revision would violate "approved options"
-- immutability just as much as editing an existing one).
CREATE OR REPLACE FUNCTION enforce_question_option_immutability()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "QuestionRevisionStatus";
  target_revision_id UUID := COALESCE(NEW.question_revision_id, OLD.question_revision_id);
BEGIN
  SELECT status INTO parent_status
    FROM question_revisions
    WHERE id = target_revision_id;

  IF parent_status = 'APPROVED' THEN
    RAISE EXCEPTION
      'question_options for APPROVED question_revisions % are immutable — % is rejected.',
      target_revision_id, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_options_immutable_when_parent_approved
  BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_question_option_immutability();

-- D-13 extension: the same protection for question_media, so a new
-- revision's content can never be simulated by attaching/detaching media on
-- an already-APPROVED revision row either — "never shared-then-mutated"
-- extends naturally to the join row, not just the underlying MediaAsset
-- (which B4 already guarantees is itself immutable).
CREATE OR REPLACE FUNCTION enforce_question_media_immutability()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "QuestionRevisionStatus";
  target_revision_id UUID := COALESCE(NEW.question_revision_id, OLD.question_revision_id);
BEGIN
  SELECT status INTO parent_status
    FROM question_revisions
    WHERE id = target_revision_id;

  IF parent_status = 'APPROVED' THEN
    RAISE EXCEPTION
      'question_media for APPROVED question_revisions % is immutable — % is rejected.',
      target_revision_id, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_media_immutable_when_parent_approved
  BEFORE INSERT OR UPDATE OR DELETE ON "question_media"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_question_media_immutability();
