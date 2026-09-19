-- B18 follow-up: status reads issue a rotated 15-minute download capability.
-- It is stored hashed; the authenticated requester is checked independently.
ALTER TABLE "export_jobs"
  ADD COLUMN "download_token_hash" varchar(64),
  ADD COLUMN "download_token_expires_at" timestamptz(6);
