-- Assessment Rules (05 §58): school-level exam defaults, seeded into new
-- exams at creation. Expand-only: new columns with defaults (duration is
-- nullable, meaning "no default").
ALTER TABLE "schools" ADD COLUMN "default_exam_duration_seconds" INTEGER,
ADD COLUMN "default_attempt_limit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "default_navigation_policy" "ExamNavigationPolicy" NOT NULL DEFAULT 'FREE',
ADD COLUMN "default_randomize_questions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "default_randomize_options" BOOLEAN NOT NULL DEFAULT false;
