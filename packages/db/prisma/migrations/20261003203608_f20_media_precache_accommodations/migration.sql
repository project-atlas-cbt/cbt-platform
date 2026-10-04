-- F20 (Accessibility, Performance & Hardening) — two backend gap-closures,
-- both project-owner decisions of 2026-10-03:
--   1. LARGER_TEXT accommodation (07 §9.7), staff-granted per participant,
--      mirroring B13's extra-time columns (DoD 3).
--   2. Encrypted media pre-cache (ADR-0021 amendment): per-exam AES-256-GCM
--      copies of question media, downloadable before Start; the key arrives
--      only in the attempt package.
--
-- Hand-written: `prisma migrate diff` also emits unrelated, pre-existing
-- naming drift from earlier hand-written migrations (index renames, B19
-- FK names); that is deliberately not touched here.

ALTER TABLE "exam_session_participants"
  ADD COLUMN "larger_text" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "larger_text_granted_by_membership_id" UUID,
  ADD COLUMN "larger_text_granted_at" TIMESTAMPTZ(6);

CREATE TABLE "exam_media_ciphertexts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_media_ciphertexts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_media_ciphertexts_byte_size_check" CHECK ("byte_size" > 0),
    CONSTRAINT "exam_media_ciphertexts_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "exam_media_ciphertexts_storage_key_key" ON "exam_media_ciphertexts"("storage_key");
CREATE INDEX "exam_media_ciphertexts_school_id_idx" ON "exam_media_ciphertexts"("school_id");
CREATE INDEX "exam_media_ciphertexts_school_id_exam_id_idx" ON "exam_media_ciphertexts"("school_id", "exam_id");
CREATE UNIQUE INDEX "exam_media_ciphertexts_school_id_exam_id_media_asset_id_key" ON "exam_media_ciphertexts"("school_id", "exam_id", "media_asset_id");

ALTER TABLE "exam_media_ciphertexts" ADD CONSTRAINT "exam_media_ciphertexts_school_id_exam_id_fkey" FOREIGN KEY ("school_id", "exam_id") REFERENCES "exams"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_media_ciphertexts" ADD CONSTRAINT "exam_media_ciphertexts_school_id_media_asset_id_fkey" FOREIGN KEY ("school_id", "media_asset_id") REFERENCES "media_assets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-0023 layer 3.
ALTER TABLE "exam_media_ciphertexts" ENABLE ROW LEVEL SECURITY; ALTER TABLE "exam_media_ciphertexts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "exam_media_ciphertexts_isolation" ON "exam_media_ciphertexts" USING (school_id::text = current_setting('app.current_school_id', true));
