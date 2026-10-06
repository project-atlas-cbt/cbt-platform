-- Audit P1-2: an answer write and a submit could commit together with the
-- answer left out of the score. The guard below read the parent attempt's
-- state with a plain SELECT, so an answer transaction that had passed the
-- check was not seen by a submit that committed meanwhile: marking then ran
-- without the answer, and the answer committed afterwards onto a SUBMITTED
-- attempt.
--
-- `FOR SHARE` makes the two wait for each other. A submit (or the
-- auto-submit sweeper, or a staff end) updates `exam_attempts.state`, which
-- needs a lock that conflicts with FOR SHARE, so it waits for any answer
-- transaction already past this check to commit; an answer write that
-- arrives during a submit waits for it, then sees SUBMITTED and is refused.
-- Answer writes do not block each other (FOR SHARE locks are compatible).
--
-- Expand-only: replaces the function body; the trigger is unchanged.
CREATE OR REPLACE FUNCTION enforce_attempt_answer_immutability()
RETURNS TRIGGER AS $$
DECLARE
  parent_state "AttemptState";
  target_attempt_id UUID := COALESCE(NEW.attempt_id, OLD.attempt_id);
BEGIN
  SELECT state INTO parent_state
    FROM exam_attempts
    WHERE id = target_attempt_id
    FOR SHARE;

  IF parent_state IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION
      'attempt_answers for exam_attempt % (state=%) are immutable — % is rejected (ADR-0007).',
      target_attempt_id, parent_state, TG_OP
      USING ERRCODE = '23000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
