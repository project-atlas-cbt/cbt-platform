-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('SCHOOL_LOGO', 'QUESTION_IMAGE', 'QUESTION_DIAGRAM', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'REJECTED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "logo_media_id" UUID,
ADD COLUMN     "primary_color" VARCHAR(7);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" VARCHAR(512) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "declared_mime_type" VARCHAR(127) NOT NULL,
    "sniffed_mime_type" VARCHAR(127),
    "declared_size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploader_user_id" UUID NOT NULL,
    "rejection_reason" TEXT,
    "upload_url_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_school_id_idx" ON "media_assets"("school_id");

-- CreateIndex
CREATE INDEX "media_assets_school_id_type_idx" ON "media_assets"("school_id", "type");

-- CreateIndex
CREATE INDEX "media_assets_school_id_status_idx" ON "media_assets"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_school_id_id_key" ON "media_assets"("school_id", "id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploader_user_id_fkey" FOREIGN KEY ("uploader_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions beyond what `prisma migrate dev` generates from the
-- schema DSL alone — same convention as the B2/B3 migrations' own RLS
-- blocks (audit_events, subscriptions, activation_grants).

-- RLS (ADR-0023): media_assets is school-owned. ENABLE alone is
-- insufficient (this migration runs as the table-owner role, and Postgres
-- exempts owners from RLS by default) — FORCE is required. FORCE alone is
-- also insufficient against a Postgres superuser, which is why the running
-- application never connects as the migration/owner role, only as the
-- non-superuser `atlas_app` (see infra/postgres/init.sql). No REVOKE is
-- attempted here to enforce MediaAsset's D-13 immutability at the grant
-- level — packages/db/src/grants.ts's grantAppRole() unconditionally
-- re-GRANTs UPDATE/DELETE on every table in `public` after `migrate
-- reset`, which would silently undo a REVOKE here (same caveat the B2
-- migration's own audit_events comment records). Immutability is enforced
-- by there being no service method that mutates storageKey/
-- declaredMimeType/declaredSizeBytes after row creation — see
-- MediaAsset's own doc comment in schema.prisma.
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_isolation" ON "media_assets"
  USING (school_id::text = current_setting('app.current_school_id', true));
