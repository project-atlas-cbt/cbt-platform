-- Bug audit P2-6: sign-in matches a login identifier case-insensitively, so
-- two members of one school whose identifiers differ only by case (ST001,
-- st001) left one of them unable to sign in. Uniqueness now follows the same
-- rule. Expand-only: an index the previous release's inserts also respect
-- (a clash surfaces as the same unique violation it already handles). It
-- fails to build if a school already holds such a pair, which the demo
-- seed does not; check a live server for such pairs before deploying.
CREATE UNIQUE INDEX "school_memberships_school_id_lower_login_identifier_key"
  ON "school_memberships" ("school_id", lower("login_identifier"));
