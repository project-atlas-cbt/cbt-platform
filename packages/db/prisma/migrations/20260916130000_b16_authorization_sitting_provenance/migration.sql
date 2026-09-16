-- F16 needs authorization provenance that cannot be misattributed to every
-- sitting of the same exam. MAKEUP points to the ABSENT participation row
-- that justified it; RETRY may point to the terminal attempt it follows.
ALTER TABLE "attempt_authorizations"
  ADD COLUMN "source_exam_session_id" UUID,
  ADD COLUMN "source_participation_id" UUID,
  ADD COLUMN "source_attempt_id" UUID;

ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_source_session_fkey"
  FOREIGN KEY ("school_id", "source_exam_session_id")
  REFERENCES "exam_sessions"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attempt_authorizations_source_participation_fkey"
  FOREIGN KEY ("school_id", "source_participation_id")
  REFERENCES "exam_participations"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attempt_authorizations_source_attempt_fkey"
  FOREIGN KEY ("school_id", "source_attempt_id")
  REFERENCES "exam_attempts"("school_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing rows created by the earlier B16 draft have no source columns.
-- NOT VALID preserves those historical rows while enforcing the shape for
-- every new or subsequently updated authorization.
ALTER TABLE "attempt_authorizations"
  ADD CONSTRAINT "attempt_authorizations_source_shape"
  CHECK (
    ("type" = 'MAKEUP' AND "source_exam_session_id" IS NOT NULL
      AND "source_participation_id" IS NOT NULL AND "source_attempt_id" IS NULL)
    OR
    ("type" = 'RETRY' AND "source_attempt_id" IS NOT NULL
      AND "source_participation_id" IS NULL)
  ) NOT VALID;

CREATE INDEX "attempt_authorizations_source_session_idx"
  ON "attempt_authorizations"("school_id", "source_exam_session_id", "student_profile_id");

CREATE UNIQUE INDEX "attempt_authorizations_source_participation_type_key"
  ON "attempt_authorizations"("school_id", "source_participation_id", "type")
  WHERE "source_participation_id" IS NOT NULL AND "status" = 'AUTHORIZED';

-- Strengthen provenance checks to bind the source to the same exam/student.
CREATE OR REPLACE FUNCTION enforce_attempt_authorization_provenance()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'AUTHORIZED' AND NEW.type = 'MAKEUP' AND NOT EXISTS (
    SELECT 1
    FROM exam_participations participation
    WHERE participation.school_id = NEW.school_id
      AND participation.id = NEW.source_participation_id
      AND participation.exam_id = NEW.exam_id
      AND participation.exam_session_id = NEW.source_exam_session_id
      AND participation.student_profile_id = NEW.student_profile_id
      AND participation.status = 'ABSENT'
      AND NOT EXISTS (
        SELECT 1
        FROM exam_participations completed
        WHERE completed.school_id = participation.school_id
          AND completed.exam_id = participation.exam_id
          AND completed.student_profile_id = participation.student_profile_id
          AND completed.status = 'COMPLETED'
          AND completed.marked_at > participation.marked_at
      )
  ) THEN
    RAISE EXCEPTION 'Makeup authorization requires its unresolved source absence'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'AUTHORIZED' AND NEW.type = 'RETRY' AND NOT EXISTS (
    SELECT 1
    FROM exam_attempts attempt
    WHERE attempt.school_id = NEW.school_id
      AND attempt.id = NEW.source_attempt_id
      AND attempt.exam_id = NEW.exam_id
      AND attempt.student_profile_id = NEW.student_profile_id
      AND attempt.state IN ('SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED')
  ) THEN
    RAISE EXCEPTION 'Retry authorization requires its source terminal attempt'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
