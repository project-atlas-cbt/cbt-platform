-- B20 — Security Hardening & Compliance.
--
-- 1. audit_events: school_id becomes nullable (platform-level events —
--    Software Admin MFA, platform login, operator commands — affect no
--    school) and its FK becomes RESTRICT. Invariant 15 (audit is append-only)
--    already made a cascading delete fail at the immutability trigger; the
--    schema now says so instead of advertising a cascade it can never run.
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_school_id_fkey";
ALTER TABLE "audit_events" ALTER COLUMN "school_id" DROP NOT NULL;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Platform rows are INSERT-only for atlas_app. audit_events_isolation
-- (USING school_id = current tenant) can never match a NULL school_id, so
-- atlas_app can neither read nor (via that policy's implicit WITH CHECK)
-- insert one; this additive permissive policy admits the insert and
-- nothing else. Reading platform rows stays exclusive to
-- atlas_audit_reader's existing USING (true) SELECT policy. Callers insert
-- without RETURNING (Prisma createMany) — RETURNING would need SELECT
-- visibility atlas_app deliberately lacks.
CREATE POLICY "audit_events_platform_insert" ON "audit_events"
  FOR INSERT TO atlas_app
  WITH CHECK (school_id IS NULL);

-- 2. Platform session idle timeout (PlatformAuthGuard).
ALTER TABLE "platform_sessions" ADD COLUMN "last_seen_at" TIMESTAMPTZ(6);

-- 3. Software Admin TOTP MFA (platform tables: no school, no RLS — same as
--    platform_sessions / platform_role_assignments).
CREATE TABLE "platform_mfa_credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_step" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_mfa_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_mfa_credentials_user_id_key" ON "platform_mfa_credentials"("user_id");

ALTER TABLE "platform_mfa_credentials" ADD CONSTRAINT "platform_mfa_credentials_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_mfa_recovery_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "credential_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_mfa_recovery_codes_code_hash_key" ON "platform_mfa_recovery_codes"("code_hash");
CREATE INDEX "platform_mfa_recovery_codes_credential_id_idx" ON "platform_mfa_recovery_codes"("credential_id");

ALTER TABLE "platform_mfa_recovery_codes" ADD CONSTRAINT "platform_mfa_recovery_codes_credential_id_fkey"
  FOREIGN KEY ("credential_id") REFERENCES "platform_mfa_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Least-privilege REVOKEs on atlas_app are NOT here: grants.ts's
-- grantAppRole() re-asserts the whole grant state (baseline + revokes,
-- driven by @atlas/domain's DB_PRIVILEGE_POLICY) after every deploy/reset,
-- so a REVOKE in a migration would be undone by the next blanket GRANT.
