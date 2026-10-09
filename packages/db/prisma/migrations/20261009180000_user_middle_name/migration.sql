-- Owner decision 2026-10-09: an optional middle name. Expand-only: a
-- nullable column, no default, no rewrite; existing rows keep NULL.
ALTER TABLE "users" ADD COLUMN "middle_name" TEXT;

-- Role-aware search (B18) now matches the middle name too. A new index for
-- the new expression; the old one stays until a later contract release
-- drops it, because the previous release still queries its expression.
CREATE INDEX "users_full_name_email_fts_idx" ON "users" USING GIN (
  to_tsvector('simple'::regconfig, coalesce("first_name", '') || ' ' || coalesce("middle_name", '') || ' ' || coalesce("last_name", '') || ' ' || coalesce("email", ''))
);
