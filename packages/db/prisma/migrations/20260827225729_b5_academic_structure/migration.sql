-- CreateEnum
CREATE TYPE "AcademicSessionStatus" AS ENUM ('DRAFT', 'UPCOMING', 'CURRENT', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AcademicTermStatus" AS ENUM ('DRAFT', 'UPCOMING', 'CURRENT', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClassLevel" AS ENUM ('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3');

-- CreateEnum
CREATE TYPE "ClassGroupStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClassSubjectStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HODAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicTermStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "department_id" UUID,
    "name" VARCHAR(32) NOT NULL,
    "level" "ClassLevel" NOT NULL,
    "arm" VARCHAR(16) NOT NULL,
    "status" "ClassGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "department_id" UUID,
    "name" VARCHAR(128) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "status" "SubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "status" "ClassSubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hod_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "HODAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hod_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_sessions_school_id_idx" ON "academic_sessions"("school_id");

-- CreateIndex
CREATE INDEX "academic_sessions_school_id_status_idx" ON "academic_sessions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_school_id_id_key" ON "academic_sessions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_school_id_name_key" ON "academic_sessions"("school_id", "name");

-- CreateIndex
CREATE INDEX "academic_terms_school_id_idx" ON "academic_terms"("school_id");

-- CreateIndex
CREATE INDEX "academic_terms_school_id_academic_session_id_idx" ON "academic_terms"("school_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "academic_terms_school_id_status_idx" ON "academic_terms"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_school_id_academic_session_id_sequence_key" ON "academic_terms"("school_id", "academic_session_id", "sequence");

-- CreateIndex
CREATE INDEX "departments_school_id_idx" ON "departments"("school_id");

-- CreateIndex
CREATE INDEX "departments_school_id_status_idx" ON "departments"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_school_id_id_key" ON "departments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_school_id_code_key" ON "departments"("school_id", "code");

-- CreateIndex
CREATE INDEX "class_groups_school_id_idx" ON "class_groups"("school_id");

-- CreateIndex
CREATE INDEX "class_groups_school_id_academic_session_id_idx" ON "class_groups"("school_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "class_groups_school_id_department_id_idx" ON "class_groups"("school_id", "department_id");

-- CreateIndex
CREATE INDEX "class_groups_school_id_status_idx" ON "class_groups"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "class_groups_school_id_id_academic_session_id_key" ON "class_groups"("school_id", "id", "academic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_groups_school_id_academic_session_id_level_arm_key" ON "class_groups"("school_id", "academic_session_id", "level", "arm");

-- CreateIndex
CREATE INDEX "subjects_school_id_idx" ON "subjects"("school_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_department_id_idx" ON "subjects"("school_id", "department_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_status_idx" ON "subjects"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_id_key" ON "subjects"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_code_key" ON "subjects"("school_id", "code");

-- CreateIndex
CREATE INDEX "class_subjects_school_id_idx" ON "class_subjects"("school_id");

-- CreateIndex
CREATE INDEX "class_subjects_school_id_class_id_idx" ON "class_subjects"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "class_subjects_school_id_subject_id_idx" ON "class_subjects"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "class_subjects_school_id_academic_session_id_idx" ON "class_subjects"("school_id", "academic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_school_id_class_id_subject_id_key" ON "class_subjects"("school_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "hod_assignments_school_id_idx" ON "hod_assignments"("school_id");

-- CreateIndex
CREATE INDEX "hod_assignments_school_id_membership_id_idx" ON "hod_assignments"("school_id", "membership_id");

-- CreateIndex
CREATE INDEX "hod_assignments_school_id_department_id_idx" ON "hod_assignments"("school_id", "department_id");

-- CreateIndex
CREATE INDEX "hod_assignments_school_id_academic_session_id_idx" ON "hod_assignments"("school_id", "academic_session_id");

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_school_id_class_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "class_id", "academic_session_id") REFERENCES "class_groups"("school_id", "id", "academic_session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hod_assignments" ADD CONSTRAINT "hod_assignments_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hod_assignments" ADD CONSTRAINT "hod_assignments_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hod_assignments" ADD CONSTRAINT "hod_assignments_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate dev` generates from the
-- schema DSL alone — same convention as B2's audit_events RLS block and
-- B3's/B4's own hand-written RLS + partial-unique-index blocks.

-- RLS (ADR-0023): all 7 new tables are school-owned. ENABLE alone is
-- insufficient (this migration runs as the table-owner role, which Postgres
-- exempts from RLS by default) — FORCE is required. The running application
-- never connects as the migration/owner role, only as the non-superuser
-- `atlas_app` (see infra/postgres/init.sql), for which FORCE has real effect.
ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_sessions_isolation" ON "academic_sessions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "academic_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_terms" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_terms_isolation" ON "academic_terms"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "departments_isolation" ON "departments"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "class_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "class_groups_isolation" ON "class_groups"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subjects_isolation" ON "subjects"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "class_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "class_subjects_isolation" ON "class_subjects"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "hod_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hod_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hod_assignments_isolation" ON "hod_assignments"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- Roadmap B5 Database work: "Partial unique index enforcing one CURRENT
-- session per school" — the invariant must be structural, not
-- application-level (DoD item 2). Prisma's schema DSL cannot express a
-- filtered/partial unique index (same limitation as B3's
-- subscriptions_one_non_terminal_per_school), so it's added by hand here.
CREATE UNIQUE INDEX "academic_sessions_one_current_per_school"
  ON "academic_sessions" ("school_id")
  WHERE "status" = 'CURRENT';

-- One CURRENT term per session (not per school): sufficient because at most
-- one session per school is ever CURRENT (the index above), so "the
-- current term" resolves unambiguously via that session's own one CURRENT
-- term. SessionService's activation transaction additionally bulk-closes
-- any CURRENT terms belonging to the session it is closing, so no
-- non-current session is ever left with a dangling CURRENT term.
CREATE UNIQUE INDEX "academic_terms_one_current_per_session"
  ON "academic_terms" ("academic_session_id")
  WHERE "status" = 'CURRENT';
