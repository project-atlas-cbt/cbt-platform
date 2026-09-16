-- B12 allowed exam_session_id to be nullable. B16 makes participation
-- per-sitting, so deterministically recover the latest authorized sitting
-- before adding the NOT NULL constraint.
UPDATE exam_participations participation
SET exam_session_id = source.exam_session_id
FROM LATERAL (
  SELECT participant.exam_session_id
  FROM exam_session_participants participant
  JOIN exam_sessions session
    ON session.school_id = participant.school_id
   AND session.id = participant.exam_session_id
  WHERE participant.school_id = participation.school_id
    AND participant.student_profile_id = participation.student_profile_id
    AND session.exam_id = participation.exam_id
  ORDER BY participant.authorized_at DESC, participant.id DESC
  LIMIT 1
) source
WHERE participation.exam_session_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM exam_participations WHERE exam_session_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'B16 cannot assign a sitting to one or more legacy exam_participations rows';
  END IF;
END;
$$;
