-- Enforce authorization provenance and consume the right override.
CREATE OR REPLACE FUNCTION enforce_attempt_authorization_provenance() RETURNS trigger AS $$ BEGIN
 IF NEW.type='MAKEUP' AND NOT EXISTS(SELECT 1 FROM exam_participations p WHERE p.school_id=NEW.school_id AND p.exam_id=NEW.exam_id AND p.student_profile_id=NEW.student_profile_id AND p.status='ABSENT') THEN RAISE EXCEPTION 'Makeup authorization requires recorded absence'; END IF;
 IF NEW.type='RETRY' AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.school_id=NEW.school_id AND a.exam_id=NEW.exam_id AND a.student_profile_id=NEW.student_profile_id AND a.state IN('SUBMITTED','AUTO_SUBMITTED','INVALIDATED')) THEN RAISE EXCEPTION 'Retry authorization requires a prior terminal attempt'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "attempt_authorizations_provenance_guard" BEFORE INSERT ON "attempt_authorizations" FOR EACH ROW EXECUTE FUNCTION enforce_attempt_authorization_provenance();

CREATE OR REPLACE FUNCTION b16_attempt_insert() RETURNS trigger AS $$ DECLARE auth_id uuid;auth_type "AttemptAuthorizationType";BEGIN
 SELECT x.id,x.type INTO auth_id,auth_type FROM attempt_authorizations x WHERE x.school_id=NEW.school_id AND x.exam_id=NEW.exam_id AND x.student_profile_id=NEW.student_profile_id AND x.status='AUTHORIZED' AND (x.expires_at IS NULL OR x.expires_at>CURRENT_TIMESTAMP) AND (x.type='MAKEUP' OR (x.type='RETRY' AND (SELECT count(*) FROM exam_attempts a WHERE a.school_id=NEW.school_id AND a.exam_id=NEW.exam_id AND a.student_profile_id=NEW.student_profile_id AND a.state IN('SUBMITTED','AUTO_SUBMITTED')) >= (SELECT attempt_limit FROM exams e WHERE e.school_id=NEW.school_id AND e.id=NEW.exam_id))) ORDER BY CASE WHEN x.type='MAKEUP' THEN 0 ELSE 1 END,x.authorized_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF auth_id IS NOT NULL THEN NEW.attempt_type:=auth_type::text::"AttemptType";UPDATE attempt_authorizations SET status='USED',used_at=CURRENT_TIMESTAMP,used_by_attempt_id=NEW.id,updated_at=CURRENT_TIMESTAMP WHERE id=auth_id;END IF;
 INSERT INTO exam_participations(school_id,exam_id,exam_session_id,student_profile_id,status)VALUES(NEW.school_id,NEW.exam_id,NEW.exam_session_id,NEW.student_profile_id,'ATTENDED')ON CONFLICT(school_id,exam_id,exam_session_id,student_profile_id)DO UPDATE SET status='ATTENDED',marked_at=CURRENT_TIMESTAMP,marked_by_membership_id=NULL,reason=NULL;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
