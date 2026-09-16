-- B16 lifecycle prerequisites and race-safe participation transitions.
CREATE OR REPLACE FUNCTION enforce_attempt_authorization_provenance()
RETURNS trigger AS $$
BEGIN
  IF NEW.status='AUTHORIZED' AND NEW.type='MAKEUP' AND NOT EXISTS (
    SELECT 1 FROM exam_participations p
    WHERE p.school_id=NEW.school_id AND p.exam_id=NEW.exam_id
      AND p.student_profile_id=NEW.student_profile_id AND p.status='ABSENT'
      AND NOT EXISTS (
        SELECT 1 FROM exam_participations c
        WHERE c.school_id=p.school_id AND c.exam_id=p.exam_id
          AND c.student_profile_id=p.student_profile_id AND c.status='COMPLETED'
          AND c.marked_at>p.marked_at
      )
  ) THEN RAISE EXCEPTION 'Makeup authorization requires an unresolved recorded absence' USING ERRCODE='23514'; END IF;
  IF NEW.status='AUTHORIZED' AND NEW.type='RETRY' AND NOT EXISTS (
    SELECT 1 FROM exam_attempts a
    WHERE a.school_id=NEW.school_id AND a.exam_id=NEW.exam_id
      AND a.student_profile_id=NEW.student_profile_id
      AND a.state IN ('SUBMITTED','AUTO_SUBMITTED','INVALIDATED')
  ) THEN RAISE EXCEPTION 'Retry authorization requires a prior terminal attempt' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "attempt_authorizations_provenance_guard"
  BEFORE INSERT OR UPDATE ON "attempt_authorizations"
  FOR EACH ROW EXECUTE FUNCTION enforce_attempt_authorization_provenance();

CREATE OR REPLACE FUNCTION b16_attempt_insert()
RETURNS trigger AS $$
DECLARE
  authorization_id uuid;
  authorization_type "AttemptAuthorizationType";
  current_exam_status "ExamStatus";
  current_session_status "ExamSessionStatus";
BEGIN
  SELECT status INTO current_exam_status FROM exams
  WHERE school_id=NEW.school_id AND id=NEW.exam_id FOR SHARE;
  SELECT status INTO current_session_status FROM exam_sessions
  WHERE school_id=NEW.school_id AND id=NEW.exam_session_id AND exam_id=NEW.exam_id FOR SHARE;
  IF current_exam_status IS NULL OR current_exam_status<>'OPEN' THEN
    RAISE EXCEPTION 'An attempt may only start while its exam is open' USING ERRCODE='23514';
  END IF;
  IF current_session_status IS NULL OR current_session_status<>'OPEN' THEN
    RAISE EXCEPTION 'An attempt may only start in an open exam session' USING ERRCODE='23514';
  END IF;
  SELECT a.id,a.type INTO authorization_id,authorization_type
  FROM attempt_authorizations a
  WHERE a.school_id=NEW.school_id AND a.exam_id=NEW.exam_id
    AND a.student_profile_id=NEW.student_profile_id AND a.status='AUTHORIZED'
    AND (a.expires_at IS NULL OR a.expires_at>CURRENT_TIMESTAMP)
  ORDER BY CASE WHEN a.type='MAKEUP' THEN 0 ELSE 1 END,a.authorized_at
  FOR UPDATE SKIP LOCKED LIMIT 1;
  IF authorization_id IS NOT NULL THEN
    NEW.attempt_type:=authorization_type::text::"AttemptType";
    UPDATE attempt_authorizations SET status='USED',used_at=CURRENT_TIMESTAMP,
      used_by_attempt_id=NEW.id,updated_at=CURRENT_TIMESTAMP WHERE id=authorization_id;
  END IF;
  INSERT INTO exam_participations
    (school_id,exam_id,exam_session_id,student_profile_id,status)
  VALUES (NEW.school_id,NEW.exam_id,NEW.exam_session_id,NEW.student_profile_id,'ATTENDED')
  ON CONFLICT (school_id,exam_id,exam_session_id,student_profile_id)
  DO UPDATE SET status='ATTENDED',marked_at=CURRENT_TIMESTAMP,
    marked_by_membership_id=NULL,reason=NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_attempts_b16_insert" BEFORE INSERT ON "exam_attempts"
  FOR EACH ROW EXECUTE FUNCTION b16_attempt_insert();

CREATE OR REPLACE FUNCTION b16_attempt_state()
RETURNS trigger AS $$
BEGIN
  IF NEW.state IN ('SUBMITTED','AUTO_SUBMITTED') AND OLD.state IS DISTINCT FROM NEW.state THEN
    UPDATE exam_participations SET status='COMPLETED',marked_at=CURRENT_TIMESTAMP
    WHERE school_id=NEW.school_id AND exam_id=NEW.exam_id
      AND exam_session_id=NEW.exam_session_id AND student_profile_id=NEW.student_profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_attempts_b16_state" AFTER UPDATE OF state ON "exam_attempts"
  FOR EACH ROW EXECUTE FUNCTION b16_attempt_state();

CREATE OR REPLACE FUNCTION enforce_absence_after_session_close()
RETURNS trigger AS $$
BEGIN
  IF NEW.status='ABSENT' AND EXISTS (
    SELECT 1 FROM exam_sessions s WHERE s.school_id=NEW.school_id
      AND s.id=NEW.exam_session_id AND s.status='OPEN'
  ) THEN RAISE EXCEPTION 'Absence cannot be confirmed while the exam session is open' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "exam_participations_absence_closed_session_guard"
  BEFORE INSERT OR UPDATE ON "exam_participations"
  FOR EACH ROW EXECUTE FUNCTION enforce_absence_after_session_close();

CREATE OR REPLACE FUNCTION enforce_attempt_question_result_requires_finalized_attempt()
RETURNS trigger AS $$
DECLARE parent_state "AttemptState";
BEGIN
  SELECT state INTO parent_state FROM exam_attempts
  WHERE school_id=NEW.school_id AND id=NEW.attempt_id FOR SHARE;
  IF parent_state NOT IN ('SUBMITTED','AUTO_SUBMITTED') THEN
    RAISE EXCEPTION 'Question results require a submitted attempt' USING ERRCODE='23000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "attempt_question_results_require_finalized_attempt"
  BEFORE INSERT OR UPDATE ON "attempt_question_results"
  FOR EACH ROW EXECUTE FUNCTION enforce_attempt_question_result_requires_finalized_attempt();

CREATE OR REPLACE FUNCTION expire_stale_attempt_authorizations()
RETURNS trigger AS $$
BEGIN
  UPDATE attempt_authorizations SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP
  WHERE school_id=NEW.school_id AND exam_id=NEW.exam_id
    AND student_profile_id=NEW.student_profile_id AND type=NEW.type
    AND status='AUTHORIZED' AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "attempt_authorizations_expire_before_insert"
  BEFORE INSERT ON "attempt_authorizations"
  FOR EACH ROW EXECUTE FUNCTION expire_stale_attempt_authorizations();
