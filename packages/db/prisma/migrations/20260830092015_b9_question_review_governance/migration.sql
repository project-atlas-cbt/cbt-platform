-- CreateEnum
CREATE TYPE "QuestionReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_CHANGES');

-- CreateTable
CREATE TABLE "question_reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "question_revision_id" UUID NOT NULL,
    "reviewer_membership_id" UUID NOT NULL,
    "decision" "QuestionReviewDecision" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_reviews_school_id_idx" ON "question_reviews"("school_id");

-- CreateIndex
CREATE INDEX "question_reviews_school_id_question_revision_id_idx" ON "question_reviews"("school_id", "question_revision_id");

-- AddForeignKey
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_school_id_question_revision_id_fkey" FOREIGN KEY ("school_id", "question_revision_id") REFERENCES "question_revisions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_school_id_reviewer_membership_id_fkey" FOREIGN KEY ("school_id", "reviewer_membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as B3's/B4's/B5's/B6's/B8's own
-- hand-written RLS blocks, extended here with this codebase's 4th trigger.

-- RLS (ADR-0023): question_reviews is school-owned, same as every other
-- table in this domain since B0's bootstrap migration.
ALTER TABLE "question_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "question_reviews_isolation" ON "question_reviews"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- Roadmap's own Database work: "QuestionReview append-only; updates and
-- deletes blocked by constraint." Unlike B8's three triggers (which only
-- fire once their parent question_revisions row is APPROVED), a
-- question_reviews row is never legitimately mutated at all, regardless of
-- its parent revision's later status — so this one is unconditional.
CREATE OR REPLACE FUNCTION enforce_question_review_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'question_reviews row % is immutable once written — % is rejected (B9 DoD item 5).',
    OLD.id, TG_OP
    USING ERRCODE = '23000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_reviews_immutable
  BEFORE UPDATE OR DELETE ON "question_reviews"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_question_review_immutability();
