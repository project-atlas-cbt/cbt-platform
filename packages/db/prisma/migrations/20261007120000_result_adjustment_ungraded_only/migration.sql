-- P2-21 "Grade now": a RECALCULATE that touches only results finalised
-- without a grade. Expand-only: a new column with a default.
ALTER TABLE "result_adjustment_operations"
  ADD COLUMN "ungraded_only" BOOLEAN NOT NULL DEFAULT false;
