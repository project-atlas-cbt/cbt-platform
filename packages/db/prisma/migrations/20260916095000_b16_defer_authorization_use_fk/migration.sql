-- b16_attempt_insert consumes an authorization from a BEFORE INSERT trigger.
-- The referenced attempt row does not become visible until the outer INSERT
-- completes, so this FK must be checked at transaction end rather than at the
-- end of the nested authorization UPDATE statement.
ALTER TABLE "attempt_authorizations"
  ALTER CONSTRAINT "attempt_authorizations_school_attempt_fkey"
  DEFERRABLE INITIALLY DEFERRED;
