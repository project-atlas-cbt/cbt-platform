-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('STUDENTS', 'TEACHERS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING_VALIDATION', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'COMMITTED', 'FAILED');

-- AlterEnum
ALTER TYPE "MediaAssetType" ADD VALUE 'IMPORT_SOURCE';

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "type" "ImportJobType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "source_media_asset_id" UUID NOT NULL,
    "uploader_user_id" UUID NOT NULL,
    "uploader_role" "Role" NOT NULL,
    "target_academic_session_id" UUID,
    "template_version" INTEGER NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "committed_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'INVALID',
    "errors" JSONB,
    "result_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_school_id_idx" ON "import_jobs"("school_id");

-- CreateIndex
CREATE INDEX "import_jobs_school_id_status_idx" ON "import_jobs"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_school_id_id_key" ON "import_jobs"("school_id", "id");

-- CreateIndex
CREATE INDEX "import_rows_school_id_idx" ON "import_rows"("school_id");

-- CreateIndex
CREATE INDEX "import_rows_school_id_import_job_id_status_idx" ON "import_rows"("school_id", "import_job_id", "status");

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_school_id_import_job_id_fkey" FOREIGN KEY ("school_id", "import_job_id") REFERENCES "import_jobs"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as B2's/B3's/B4's/B5's/B6's own
-- hand-written RLS blocks.

-- RLS (ADR-0023): both new tables are school-owned. ENABLE alone is
-- insufficient (this migration runs as the table-owner role, which Postgres
-- exempts from RLS by default) — FORCE is required. The running application
-- never connects as the migration/owner role, only as the non-superuser
-- `atlas_app` (see infra/postgres/init.sql), for which FORCE has real effect.
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_jobs_isolation" ON "import_jobs"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_rows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "import_rows_isolation" ON "import_rows"
  USING (school_id::text = current_setting('app.current_school_id', true));
