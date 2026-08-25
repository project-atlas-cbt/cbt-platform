/*
  Warnings:

  - You are about to drop the `tenancy_probe_children` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenancy_probes` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CredentialState" AS ENUM ('MUST_SET_PASSWORD', 'MUST_CHANGE_PASSWORD', 'OK');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SOFTWARE_ADMIN', 'SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "StudentProfileStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- DropForeignKey
ALTER TABLE "tenancy_probe_children" DROP CONSTRAINT "tenancy_probe_children_school_id_probe_id_fkey";

-- DropForeignKey
ALTER TABLE "tenancy_probes" DROP CONSTRAINT "tenancy_probes_school_id_fkey";

-- DropTable
DROP TABLE "tenancy_probe_children";

-- DropTable
DROP TABLE "tenancy_probes";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" VARCHAR(320),
    "password_hash" TEXT,
    "credential_state" "CredentialState" NOT NULL DEFAULT 'MUST_SET_PASSWORD',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "login_identifier" VARCHAR(64) NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "student_id" VARCHAR(32) NOT NULL,
    "admission_number" VARCHAR(32),
    "status" "StudentProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "admission_date" TIMESTAMPTZ(6),
    "graduation_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "staff_id" VARCHAR(32) NOT NULL,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hire_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "rotated_from_id" UUID,
    "user_agent" TEXT,
    "ip_address" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_memberships_school_id_idx" ON "school_memberships"("school_id");

-- CreateIndex
CREATE INDEX "school_memberships_user_id_idx" ON "school_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_id_key" ON "school_memberships"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_login_identifier_key" ON "school_memberships"("school_id", "login_identifier");

-- CreateIndex
CREATE INDEX "role_assignments_school_id_idx" ON "role_assignments"("school_id");

-- CreateIndex
CREATE INDEX "role_assignments_school_id_membership_id_idx" ON "role_assignments"("school_id", "membership_id");

-- CreateIndex
CREATE INDEX "student_profiles_school_id_idx" ON "student_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_school_id_membership_id_key" ON "student_profiles"("school_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_school_id_student_id_key" ON "student_profiles"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_school_id_idx" ON "teacher_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_school_id_membership_id_key" ON "teacher_profiles"("school_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_school_id_staff_id_key" ON "teacher_profiles"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_rotated_from_id_key" ON "sessions"("rotated_from_id");

-- CreateIndex
CREATE INDEX "sessions_school_id_idx" ON "sessions"("school_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_school_id_idx" ON "password_reset_tokens"("school_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-0023 Row-Level Security, extended to B1's real school-owned tables —
-- see the rls_bootstrap migration's comment for FORCE/superuser rationale,
-- which applies identically here. "users" itself is intentionally absent:
-- it carries no school_id (see schema.prisma's User doc comment) and RLS
-- has nothing to scope it by; access to a User row is always reached via a
-- school-scoped SchoolMembership/Session/PasswordResetToken row instead.

ALTER TABLE "school_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_memberships_isolation" ON "school_memberships"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_assignments_isolation" ON "role_assignments"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_profiles_isolation" ON "student_profiles"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "teacher_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_profiles_isolation" ON "teacher_profiles"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_isolation" ON "sessions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "password_reset_tokens_isolation" ON "password_reset_tokens"
  USING (school_id::text = current_setting('app.current_school_id', true));
