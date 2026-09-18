-- B17 is a derived read model: these indexes accelerate rebuildable joins and
-- time-filtered result scans only. No analytics facts are persisted here.
CREATE INDEX "attempt_question_results_school_exam_question_idx"
  ON "attempt_question_results"("school_id", "exam_question_id");
CREATE INDEX "results_school_state_finalized_at_idx"
  ON "results"("school_id", "state", "finalized_at");
CREATE INDEX "exam_attempts_school_exam_student_state_idx"
  ON "exam_attempts"("school_id", "exam_id", "student_profile_id", "state");
