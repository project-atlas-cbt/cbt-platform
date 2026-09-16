-- Serialize attempt creation with exam/session closure. The application selects
-- an OPEN sitting before inserting, but only row locks make that decision safe
-- against a concurrent End Examination or Close Session transaction.
CREATE OR REPLACE FUNCTION b16_attempt_insert()
RETURNS trigger AS $$
DECLARE
  authorization_id uuid;
  authorization_type "AttemptAuthorizationType";
  current_exam_status "ExamStatus";
  current_session_status "ExamSessionStatus";
BEGIN
  SELECT status INTO current_exam_status
  FROM exams
  WHERE school_id = NEW.school_id AND id = NEW.exam_id
  FOR SHARE;

  SELECT status INTO current_session_status
  FROM exam_sessions
  WHERE school_id = NEW.school_id
    AND id = NEW.exam_session_id
    AND exam_id = NEW.exam_id
  FOR SHARE;

  IF current_exam_status IS NULL OR current_exam_status <> 'OPEN' THEN
    RAISE EXCEPTION 'An attempt may only start while its exam is open'
      USING ERRCODE = '23514';
  END IF;
  IF current_session_status IS NULL OR current_session_status <> 'OPEN' THEN
    RAISE EXCEPTION 'An attempt may only start in an open exam session'
      USING ERRCODE = '23514';
  END IF;

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
