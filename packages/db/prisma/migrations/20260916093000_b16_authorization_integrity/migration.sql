-- B16 review fixes: authorization actor provenance and meaningful expiry.
ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_authorized_by_membership_fkey"
  FOREIGN KEY ("school_id", "authorized_by_membership_id")
  REFERENCES "school_memberships"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_revoked_by_membership_fkey"
  FOREIGN KEY ("school_id", "revoked_by_membership_id")
  REFERENCES "school_memberships"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_expiry_after_authorization"
  CHECK ("expires_at" IS NULL OR "expires_at" > "authorized_at");

-- Expired rows no longer occupy the one-active-authorization slot forever.
-- This is intentionally a write-time transition; read surfaces also derive
-- EXPIRED when the wall clock has passed but no later write has occurred.
CREATE OR REPLACE FUNCTION expire_stale_attempt_authorizations()
RETURNS trigger AS $$
BEGIN
  UPDATE attempt_authorizations
  SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
  WHERE school_id = NEW.school_id
    AND exam_id = NEW.exam_id
    AND student_profile_id = NEW.student_profile_id
    AND type = NEW.type
    AND status = 'AUTHORIZED'
    AND expires_at IS NOT NULL
    AND expires_at <= CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attempt_authorizations_expire_before_insert"
  BEFORE INSERT ON "attempt_authorizations"
  FOR EACH ROW EXECUTE FUNCTION expire_stale_attempt_authorizations();
