-- CreateEnum
CREATE TYPE "ExportJobType" AS ENUM ('EXAM_RESULTS', 'STUDENTS', 'TEACHERS', 'CLASSES', 'QUESTION_BANK', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "type" "ExportJobType" NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "requester_user_id" UUID NOT NULL,
    "requester_role" "Role" NOT NULL,
    "requester_membership_id" UUID,
    "scope" JSONB NOT NULL,
    "storage_key" VARCHAR(512),
    "original_filename" VARCHAR(255),
    "content_type" VARCHAR(127),
    "size_bytes" INTEGER,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "export_jobs_school_id_id_key" ON "export_jobs"("school_id", "id");
CREATE INDEX "export_jobs_school_id_idx" ON "export_jobs"("school_id");
CREATE INDEX "export_jobs_school_id_status_idx" ON "export_jobs"("school_id", "status");
CREATE INDEX "export_jobs_school_id_requester_user_id_idx" ON "export_jobs"("school_id", "requester_user_id");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (ADR-0023): export_jobs is school-owned. ENABLE + FORCE ROW LEVEL SECURITY.
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "export_jobs_isolation" ON "export_jobs"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- B18: PostgreSQL Full-Text Search GIN indexes for role-aware search (M-17)
CREATE INDEX "users_name_email_fts_idx" ON "users" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("first_name", '') || ' ' || coalesce("last_name", '') || ' ' || coalesce("email", ''))
);

CREATE INDEX "student_profiles_admission_fts_idx" ON "student_profiles" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("admission_number", ''))
);

CREATE INDEX "teacher_profiles_staff_id_fts_idx" ON "teacher_profiles" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("staff_id", ''))
);

CREATE INDEX "class_groups_name_arm_fts_idx" ON "class_groups" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("name", '') || ' ' || coalesce("arm", ''))
);

CREATE INDEX "subjects_name_code_fts_idx" ON "subjects" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("name", '') || ' ' || coalesce("code", ''))
);

CREATE INDEX "exams_title_fts_idx" ON "exams" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("title", ''))
);

CREATE INDEX "question_revisions_content_fts_idx" ON "question_revisions" USING GIN (
  to_tsvector('english'::regconfig, coalesce("content", ''))
);

CREATE INDEX "schools_name_subdomain_fts_idx" ON "schools" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("name", '') || ' ' || coalesce("subdomain", ''))
);
