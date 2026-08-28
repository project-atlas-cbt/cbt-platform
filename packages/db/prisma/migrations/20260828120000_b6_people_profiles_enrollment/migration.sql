-- CreateEnum
CREATE TYPE "StudentEnrollmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TeacherAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "StudentSubjectRegistrationStatus" AS ENUM ('REGISTERED', 'DEREGISTERED');

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "StudentEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "teacher_profile_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "TeacherAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subject_registrations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "student_enrollment_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "status" "StudentSubjectRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deregistered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_subject_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_idx" ON "student_enrollments"("school_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_student_profile_id_idx" ON "student_enrollments"("school_id", "student_profile_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_class_id_idx" ON "student_enrollments"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_academic_session_id_idx" ON "student_enrollments"("school_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_status_idx" ON "student_enrollments"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_school_id_id_key" ON "student_enrollments"("school_id", "id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_idx" ON "teacher_assignments"("school_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_teacher_profile_id_idx" ON "teacher_assignments"("school_id", "teacher_profile_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_class_subject_id_idx" ON "teacher_assignments"("school_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_academic_session_id_idx" ON "teacher_assignments"("school_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_status_idx" ON "teacher_assignments"("school_id", "status");

-- CreateIndex
CREATE INDEX "student_subject_registrations_school_id_idx" ON "student_subject_registrations"("school_id");

-- CreateIndex
CREATE INDEX "student_subject_registrations_school_id_student_enrollment__idx" ON "student_subject_registrations"("school_id", "student_enrollment_id");

-- CreateIndex
CREATE INDEX "student_subject_registrations_school_id_class_subject_id_idx" ON "student_subject_registrations"("school_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "student_subject_registrations_school_id_status_idx" ON "student_subject_registrations"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_subject_registrations_school_id_student_enrollment__key" ON "student_subject_registrations"("school_id", "student_enrollment_id", "class_subject_id");

-- CreateIndex (additive — ClassSubject/StudentProfile/TeacherProfile did not
-- previously need a composite-FK-target unique on (school_id, id); B6's new
-- tables FK against them, following the established convention every other
-- composite-FK-target table already uses.)
CREATE UNIQUE INDEX "class_subjects_school_id_id_key" ON "class_subjects"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_school_id_id_key" ON "student_profiles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_school_id_id_key" ON "teacher_profiles"("school_id", "id");

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_student_profile_id_fkey" FOREIGN KEY ("school_id", "student_profile_id") REFERENCES "student_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_class_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "class_id", "academic_session_id") REFERENCES "class_groups"("school_id", "id", "academic_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_teacher_profile_id_fkey" FOREIGN KEY ("school_id", "teacher_profile_id") REFERENCES "teacher_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_class_subject_id_fkey" FOREIGN KEY ("school_id", "class_subject_id") REFERENCES "class_subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_academic_session_id_fkey" FOREIGN KEY ("school_id", "academic_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_registrations" ADD CONSTRAINT "student_subject_registrations_school_id_student_enrollment_fkey" FOREIGN KEY ("school_id", "student_enrollment_id") REFERENCES "student_enrollments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_registrations" ADD CONSTRAINT "student_subject_registrations_school_id_class_subject_id_fkey" FOREIGN KEY ("school_id", "class_subject_id") REFERENCES "class_subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate diff` generates from
-- the schema DSL alone — same convention as B2's audit_events RLS block and
-- B3's/B4's/B5's own hand-written RLS + partial-unique-index blocks.

-- RLS (ADR-0023): all 3 new tables are school-owned. ENABLE alone is
-- insufficient (this migration runs as the table-owner role, which Postgres
-- exempts from RLS by default) — FORCE is required. The running application
-- never connects as the migration/owner role, only as the non-superuser
-- `atlas_app` (see infra/postgres/init.sql), for which FORCE has real effect.
ALTER TABLE "student_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_enrollments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_enrollments_isolation" ON "student_enrollments"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "teacher_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_assignments_isolation" ON "teacher_assignments"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "student_subject_registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_subject_registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_subject_registrations_isolation" ON "student_subject_registrations"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- Roadmap B6 Database work / DoD item 9: "a student cannot be enrolled
-- twice concurrently in one session" must be structural, not
-- application-level. Prisma's schema DSL cannot express a filtered/partial
-- unique index (same limitation as B5's academic_sessions_one_current_per_
-- school), so it's added by hand here.
CREATE UNIQUE INDEX "student_enrollments_one_active_per_session"
  ON "student_enrollments" ("school_id", "student_profile_id", "academic_session_id")
  WHERE "status" = 'ACTIVE';

-- DoD items 4/5: at most one ACTIVE assignment per (teacher, classSubject)
-- pair — re-assignment after ending the same pair (rehire) must stay
-- possible, so this is scoped to ACTIVE rows only, not a plain unique.
CREATE UNIQUE INDEX "teacher_assignments_one_active_per_pair"
  ON "teacher_assignments" ("school_id", "teacher_profile_id", "class_subject_id")
  WHERE "status" = 'ACTIVE';
