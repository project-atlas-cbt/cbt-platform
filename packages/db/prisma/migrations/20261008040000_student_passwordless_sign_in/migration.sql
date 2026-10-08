-- Passwordless student sign-in (owner decision 2026-10-08). Expand-only:
-- three boolean columns with defaults, so existing rows and the previous
-- release keep working unchanged.
ALTER TABLE "schools" ADD COLUMN "student_passwordless_sign_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "class_groups" ADD COLUMN "passwordless_sign_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "passwordless" BOOLEAN NOT NULL DEFAULT false;
