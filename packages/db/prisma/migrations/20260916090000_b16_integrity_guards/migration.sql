-- B16 review fixes: enforce lifecycle prerequisites at every write boundary.

DROP TRIGGER IF EXISTS "attempt_authorizations_provenance_guard" ON "attempt_authorizations";
CREATE OR REPLACE FUNCTION enforce_attempt_authorization_provenance()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'AUTHORIZED' AND NEW.type = 'MAKEUP' AND NOT EXISTS (
    SELECT 1
    FROM exam_participations absent
    WHERE absent.school_id = NEW.school_id
      AND absent.exam_id = NEW.exam_id
      AND absent.student_profile_id = NEW.student_profile_id
      AND absent.status = 'ABSENT'
      AND NOT EXISTS (
        SELECT 1
        FROM exam_participations completed
        WHERE completed.school_id = absent.school_id
          AND completed.exam_id = absent.exam_id
          AND completed.student_profile_id = absent.student_profile_id
          AND completed.status = 'COMPLETED'
          AND completed.marked_at > absent.marked_at
      )
  ) THEN
    RAISE EXCEPTION 'Makeup authorization requires an unresolved recorded absence';
  END IF;

  IF NEW.status = 'AUTHORIZED' AND NEW.type = 'RETRY' AND NOT EXISTS (
    SELECT 1
    FROM exam_attempts attempt
    WHERE attempt.school_id = NEW.school_id
      AND attempt.exam_id = NEW.exam_id
      AND attempt.student_profile_id = NEW.student_profile_id
      AND attempt.state IN ('SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED')
  ) THEN
    RAISE EXCEPTION 'Retry authorization requires a prior terminal attempt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "attempt_authorizations_provenance_guard"
  BEFORE INSERT OR UPDATE ON "attempt_authorizations"
  FOR EACH ROW EXECUTE FUNCTION enforce_attempt_authorization_provenance();

-- A granted retry is explicit provenance for the next attempt even when an
-- invalidated attempt means the configured numeric limit has spare headroom.
CREATE OR REPLACE FUNCTION b16_attempt_insert()
RETURNS trigger AS $$
DECLARE
  authorization_id uuid;
  authorization_type "AttemptAuthorizationType";
BEGIN
  SELECT authorization.id, authorization.type
    INTO authorization_id, authorization_type
  FROM attempt_authorizations authorization
  WHERE authorization.school_id = NEW.school_id
    AND authorization.exam_id = NEW.exam_id
    AND authorization.student_profile_id = NEW.student_profile_id
    AND authorization.status = 'AUTHORIZED'
    AND (authorization.expires_at IS NULL OR authorization.expires_at > CURRENT_TIMESTAMP)
  ORDER BY CASE WHEN authorization.type = 'MAKEUP' THEN 0 ELSE 1 END,
           authorization.authorized_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF authorization_id IS NOT NULL THEN
    NEW.attempt_type := authorization_type::text::"AttemptType";
    UPDATE attempt_authorizations
    SET status = 'USED', used_at = CURRENT_TIMESTAMP,
        used_by_attempt_id = NEW.id, updated_at = CURRENT_TIMESTAMP
    WHERE id = authorization_id;
  END IF;

  INSERT INTO exam_participations
    (school_id, exam_id, exam_session_id, student_profile_id, status)
  VALUES
    (NEW.school_id, NEW.exam_id, NEW.exam_session_id, NEW.student_profile_id, 'ATTENDED')
  ON CONFLICT (school_id, exam_id, exam_session_id, student_profile_id)
  DO UPDATE SET status = 'ATTENDED', marked_at = CURRENT_TIMESTAMP,
                marked_by_membership_id = NULL, reason = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_absence_after_session_close()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ABSENT' AND EXISTS (
    SELECT 1 FROM exam_sessions session
    WHERE session.school_id = NEW.school_id
      AND session.id = NEW.exam_session_id
      AND session.status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'Absence cannot be confirmed while the exam session is open';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_participations_absence_closed_session_guard"
  BEFORE INSERT OR UPDATE ON "exam_participations"
  FOR EACH ROW EXECUTE FUNCTION enforce_absence_after_session_close();

-- Marking must never create or recreate evidence for an invalidated attempt.
CREATE OR REPLACE FUNCTION enforce_attempt_question_result_requires_finalized_attempt()
RETURNS trigger AS $$
DECLARE
  parent_state "AttemptState";
BEGIN
  SELECT state INTO parent_state
  FROM exam_attempts
  WHERE school_id = NEW.school_id AND id = NEW.attempt_id;

  IF parent_state NOT IN ('SUBMITTED', 'AUTO_SUBMITTED') THEN
    RAISE EXCEPTION
      'attempt_question_results for exam_attempt % require a submitted attempt, found %.',
      NEW.attempt_id, parent_state
      USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
