-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('PROVISIONAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "SchoolPlatformOverride" AS ENUM ('SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivationGrantPurpose" AS ENUM ('INITIAL_ACTIVATION', 'RENEWAL');

-- CreateEnum
CREATE TYPE "ActivationGrantStatus" AS ENUM ('ISSUED', 'ACTIVATED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contact_email" VARCHAR(320),
ADD COLUMN     "contact_phone" VARCHAR(32),
ADD COLUMN     "platform_override" "SchoolPlatformOverride",
ADD COLUMN     "short_name" VARCHAR(32),
ADD COLUMN     "status" "SchoolStatus" NOT NULL DEFAULT 'PROVISIONAL';

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "plan" VARCHAR(64) NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "last_warning_threshold_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_grants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "purpose" "ActivationGrantPurpose" NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ActivationGrantStatus" NOT NULL DEFAULT 'ISSUED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activation_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "rotated_from_id" UUID,
    "user_agent" TEXT,
    "ip_address" VARCHAR(64),

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_school_id_idx" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "subscriptions_school_id_status_idx" ON "subscriptions"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_school_id_id_key" ON "subscriptions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "activation_grants_key_hash_key" ON "activation_grants"("key_hash");

-- CreateIndex
CREATE INDEX "activation_grants_school_id_idx" ON "activation_grants"("school_id");

-- CreateIndex
CREATE INDEX "activation_grants_subscription_id_idx" ON "activation_grants"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_rotated_from_id_key" ON "platform_sessions"("rotated_from_id");

-- CreateIndex
CREATE INDEX "platform_sessions_user_id_idx" ON "platform_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_grants" ADD CONSTRAINT "activation_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_grants" ADD CONSTRAINT "activation_grants_school_id_subscription_id_fkey" FOREIGN KEY ("school_id", "subscription_id") REFERENCES "subscriptions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_grants" ADD CONSTRAINT "activation_grants_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "platform_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate dev` generates from the
-- schema DSL alone — same convention as the B2 migration's own audit_events
-- RLS block and PlatformRoleAssignment CHECK constraint.

-- RLS (ADR-0023): both new tables are school-owned. ENABLE alone is
-- insufficient (this migration runs as the table-owner role, and Postgres
-- exempts owners from RLS by default) — FORCE is required. FORCE alone is
-- also insufficient against a Postgres superuser, which is why the running
-- application never connects as the migration/owner role, only as the
-- non-superuser `atlas_app` (see infra/postgres/init.sql).
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_isolation" ON "subscriptions"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "activation_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activation_grants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "activation_grants_isolation" ON "activation_grants"
  USING (school_id::text = current_setting('app.current_school_id', true));

-- Roadmap B3 Database work: "Subscription with non-overlapping active-period
-- constraint per school" — Prisma's schema DSL cannot express a partial/
-- filtered unique index, so it's added by hand here. At most one
-- PENDING/ACTIVE/EXPIRING subscription may exist per school at a time;
-- historical EXPIRED/SUSPENDED/CANCELLED rows are unrestricted.
CREATE UNIQUE INDEX "subscriptions_one_non_terminal_per_school"
  ON "subscriptions" ("school_id")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'EXPIRING');

-- Roadmap B3 Database work: "ActivationGrant with single-use enforcement at
-- the database level (partial unique on unredeemed grants per
-- subscription)." At most one ISSUED (unredeemed) grant may exist per
-- subscription at a time — redeeming (-> ACTIVATED) or revoking
-- (-> REVOKED) frees the subscription for a new grant to be issued.
CREATE UNIQUE INDEX "activation_grants_one_issued_per_subscription"
  ON "activation_grants" ("subscription_id")
  WHERE "status" = 'ISSUED';
