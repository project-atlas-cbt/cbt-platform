-- B22 (ADR-0028 retention; project-owner decision 6A, 2026-10-04): import
-- source files are deleted from object storage 90 days after the job
-- finishes, and at once when a person the import created is redacted. This
-- records when, so the purge runs once and the import screen can say the
-- file is gone. Nullable, no default: existing jobs simply have not been
-- purged yet, and the first sweep catches up.
ALTER TABLE "import_jobs" ADD COLUMN "source_purged_at" TIMESTAMPTZ(6);
