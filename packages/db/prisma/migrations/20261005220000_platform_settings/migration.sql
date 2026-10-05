-- ADR-0036: editable platform settings (System Configuration). Expand-only:
-- a new table; no row means the env value applies.
CREATE TABLE "platform_settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_user_id" UUID NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
