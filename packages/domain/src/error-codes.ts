/**
 * Base error code enum for the ADR-0033 envelope. This is the B0 starter
 * set — generic, transport- and infrastructure-level failures every
 * endpoint can produce. Domain-specific codes (e.g. ATTEMPT_EXPIRED,
 * ATTEMPT_INVALIDATED) are added by the phase that introduces them and
 * appended here, never invented ad hoc at the call site, so the enum stays
 * the single source of truth the OpenAPI document generates from.
 *
 * `retryable` is fixed per code, not decided per occurrence: the same
 * failure must always tell the offline sync queue the same thing.
 */
export const BASE_ERROR_CODES = {
  VALIDATION_ERROR: { httpStatus: 400, retryable: false },
  UNAUTHENTICATED: { httpStatus: 401, retryable: false },
  FORBIDDEN: { httpStatus: 403, retryable: false },
  NOT_FOUND: { httpStatus: 404, retryable: false },
  CONFLICT: { httpStatus: 409, retryable: false },
  IDEMPOTENCY_KEY_REPLAY_MISMATCH: { httpStatus: 409, retryable: false },
  RATE_LIMITED: { httpStatus: 429, retryable: true },
  INTERNAL_ERROR: { httpStatus: 500, retryable: true },
  SERVICE_UNAVAILABLE: { httpStatus: 503, retryable: true },

  // B1 (Identity & Authentication) — see docs/roadmaps/backend-roadmap.md's
  // B1 DoD item 8: a MUST_CHANGE_PASSWORD/MUST_SET_PASSWORD account is
  // blocked from every authenticated route except password/change, enforced
  // centrally by AuthGuard so it can't be bypassed by calling another route.
  PASSWORD_CHANGE_REQUIRED: { httpStatus: 403, retryable: false },

  // B20 (Security Hardening): with PLATFORM_MFA_REQUIRED on, a Software
  // Admin without an enrolled second factor may only reach the enrolment
  // routes — same central-gate shape as PASSWORD_CHANGE_REQUIRED above.
  MFA_ENROLMENT_REQUIRED: { httpStatus: 403, retryable: false },

  // B3 (Platform, Schools & Subscriptions).
  //
  // ACTIVATION_KEY_INVALID: the one response for "no such key" AND "this key
  // belongs to a different school" — enumeration-resistant by design, same
  // 404-not-403 rationale as NOT_FOUND above (never disclose existence
  // across a tenant boundary). ALREADY_USED/EXPIRED are distinct 409s
  // because /v1/activation/verify's whole purpose is telling a legitimate
  // admin *why* their key doesn't work, before they commit to a password —
  // unlike login, there is no account-enumeration concern for a key the
  // caller must already physically possess.
  ACTIVATION_KEY_INVALID: { httpStatus: 404, retryable: false },
  ACTIVATION_KEY_ALREADY_USED: { httpStatus: 409, retryable: false },
  ACTIVATION_KEY_EXPIRED: { httpStatus: 409, retryable: false },
  SUBSCRIPTION_PERIOD_OVERLAP: { httpStatus: 409, retryable: false },

  // Roadmap DoD item 4: "Suspension blocks school access immediately" —
  // enforced centrally by AuthGuard (identity module) on *every*
  // authenticated request, not just new logins, so an already-open session
  // stops working the moment a platform override is set. Distinct codes
  // (not a generic FORBIDDEN) because, unlike activation-key enumeration,
  // there is no secrecy concern here — the subdomain's existence and
  // branding are already publicly visible before any credentials are
  // entered (GET /tenant/resolve), so a specific, honest reason is more
  // useful than a vague one. Never returned for EXPIRED alone — ADR-0015
  // explicitly keeps login/reads/renewal working through an expired
  // subscription; only an explicit platform override blocks login itself.
  SCHOOL_ACCESS_SUSPENDED: { httpStatus: 403, retryable: false },
  SCHOOL_ACCESS_DEACTIVATED: { httpStatus: 403, retryable: false },

  // B4 (Media, Storage & Branding).
  //
  // MEDIA_UPLOAD_NOT_FOUND is also the cross-school-media response (404,
  // not 403) — RLS makes another school's MediaAsset row invisible to
  // withTenant(), which is indistinguishable from "doesn't exist" and
  // deliberately so (never disclose existence across a tenant boundary,
  // same rationale as NOT_FOUND/ACTIVATION_KEY_INVALID above).
  MEDIA_TYPE_NOT_UPLOADABLE: { httpStatus: 400, retryable: false },
  MEDIA_UPLOAD_NOT_FOUND: { httpStatus: 404, retryable: false },
  MEDIA_UPLOAD_EXPIRED: { httpStatus: 409, retryable: false },
  MEDIA_UPLOAD_NOT_RECEIVED: { httpStatus: 409, retryable: false },
  MEDIA_CONTENT_TYPE_MISMATCH: { httpStatus: 422, retryable: false },
  MEDIA_TOO_LARGE: { httpStatus: 422, retryable: false },
  MEDIA_DIMENSIONS_INVALID: { httpStatus: 422, retryable: false },
  MEDIA_NOT_READY: { httpStatus: 409, retryable: false },

  // B5 (Academic Structure).
  //
  // ACADEMIC_ACTIVATION_CONFLICT: two concurrent activate() calls against
  // the same school/session raced (Serializable-isolation write conflict,
  // or the partial-unique-index rejection underneath it) — retryable,
  // unlike every other CONFLICT-shaped code here, because this one really
  // is transient: retrying once the other transaction has committed
  // succeeds. Shared by both session- and term-activation (same failure
  // shape, same client handling).
  ACADEMIC_ACTIVATION_CONFLICT: { httpStatus: 409, retryable: true },
  // ACADEMIC_STRUCTURE_HAS_DEPENDENTS: a hard-delete was attempted on a
  // session/department/class/subject that other rows still reference —
  // roadmap DoD item 5's "clear error" when destructive deletion is
  // refused. Deactivation (never blocked) is the correct action instead.
  ACADEMIC_STRUCTURE_HAS_DEPENDENTS: { httpStatus: 409, retryable: false },
  // HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE: the referenced SchoolMembership has
  // no active HOD RoleAssignment (D-11 / roadmap DoD item 8) — a business-
  // rule validation failure, not a malformed request, but still a 400
  // (matches the shape of every other pre-mutation invariant check in this
  // codebase, e.g. B1's credential validation).
  HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE: { httpStatus: 400, retryable: false },

  // B6 (People, Profiles & Enrollment) — mirrors HOD_ASSIGNMENT_REQUIRES_
  // ACTIVE_ROLE's own shape exactly for the two sibling active-role
  // invariant checks StudentEnrollmentService/TeacherAssignmentService add.
  STUDENT_ENROLLMENT_REQUIRES_ACTIVE_ROLE: { httpStatus: 400, retryable: false },
  TEACHER_ASSIGNMENT_REQUIRES_ACTIVE_ROLE: { httpStatus: 400, retryable: false },
  // HOD_PROMOTION_REQUIRES_ACTIVE_TEACHER_ROLE: promoting a membership to
  // HOD (confirmed promote-existing-teacher model) requires an active
  // TEACHER RoleAssignment first.
  HOD_PROMOTION_REQUIRES_ACTIVE_TEACHER_ROLE: { httpStatus: 400, retryable: false },
  // ACADEMIC_STRUCTURE_SESSION_MISMATCH: an enrollment's target class
  // doesn't belong to the given academicSessionId — a request-shaped
  // validation failure, not found/conflict.
  ACADEMIC_STRUCTURE_SESSION_MISMATCH: { httpStatus: 400, retryable: false },
  // CREDENTIAL_RESET_FAILED: CredentialSheetService.issueInitialPasswords
  // returned no row for a membership that should have produced exactly
  // one — an unexpected internal-consistency failure, not a client error.
  CREDENTIAL_RESET_FAILED: { httpStatus: 500, retryable: true },

  // F4 (School Onboarding Wizard).
  //
  // ONBOARDING_FUNDAMENTALS_MISSING: POST /v1/school/onboarding/complete's
  // server-side re-check of 05 §5.2's two hard blockers (no current
  // session, no class) — defense in depth behind the client's own identical
  // disabled-button check, never trusted alone (AGENTS.md §5/§6).
  ONBOARDING_FUNDAMENTALS_MISSING: { httpStatus: 409, retryable: false },
  // ONBOARDING_ALREADY_COMPLETE: PUT .../progress refuses to mutate a
  // completed school's wizard state — server-side enforcement of "a
  // completed school cannot re-enter onboarding," not just a frontend
  // redirect.
  ONBOARDING_ALREADY_COMPLETE: { httpStatus: 409, retryable: false },

  // B7 (Bulk Import Pipeline). Whole-file rejections (bad template version,
  // unparsable file, row-count cap exceeded) are recorded as ImportJob's
  // own free-text `failureReason`, matching MediaAsset.rejectionReason's
  // existing convention — not a distinct code each, since nothing calls an
  // HTTP handler synchronously for them (they happen inside the background
  // validation job).
  //
  // IMPORT_SOURCE_NOT_READY: POST /v1/imports/{students,teachers}'s own
  // mediaAssetId doesn't resolve to a READY IMPORT_SOURCE asset owned by
  // this school — a request-shaped validation failure, not found/conflict
  // (mirrors ACADEMIC_STRUCTURE_SESSION_MISMATCH's own shape).
  IMPORT_SOURCE_NOT_READY: { httpStatus: 400, retryable: false },
  // IMPORT_JOB_NOT_VALIDATED: confirm() called on a job that isn't in
  // VALIDATED status and isn't already IMPORTING/COMPLETED (still
  // PENDING_VALIDATION/VALIDATING, or FAILED) — there is nothing to
  // confirm yet, or the file was already rejected outright.
  IMPORT_JOB_NOT_VALIDATED: { httpStatus: 409, retryable: false },
  // IMPORT_JOB_EXPIRED: confirm() called on a VALIDATED job past its A-17
  // staging-expiry window — the caller must re-upload, not retry this
  // exact job (not retryable in the ADR-0033 sense: the same call will
  // never succeed against this job again).
  IMPORT_JOB_EXPIRED: { httpStatus: 409, retryable: false },

  // B8 (Question Bank). DoD item 8's validation catalogue, plus the
  // resource-state guards a revision's lifecycle requires (mirrors
  // SessionService's own editable-set-check precedent).
  //
  // QUESTION_TEXT_EMPTY / QUESTION_INSUFFICIENT_OPTIONS /
  // QUESTION_OPTION_TEXT_EMPTY / QUESTION_CORRECT_ANSWER_MISSING /
  // QUESTION_MARKS_INVALID: the validation catalogue itself, run at submit
  // (and per-row at import) — all request-shaped, not found/conflict.
  QUESTION_TEXT_EMPTY: { httpStatus: 400, retryable: false },
  QUESTION_INSUFFICIENT_OPTIONS: { httpStatus: 400, retryable: false },
  QUESTION_OPTION_TEXT_EMPTY: { httpStatus: 400, retryable: false },
  QUESTION_CORRECT_ANSWER_MISSING: { httpStatus: 400, retryable: false },
  // Bug audit P3-9: a True/False question has exactly two options.
  QUESTION_TRUE_FALSE_OPTIONS: { httpStatus: 400, retryable: false },
  // QUESTION_OPTION_NOT_FOUND: a body-supplied option id doesn't belong to
  // this revision — this schema stores correctFlag per-option (06 §27),
  // not a separate correct-answer pointer field, so this is the closest
  // faithful equivalent of "correct answer references a non-existent
  // option."
  QUESTION_OPTION_NOT_FOUND: { httpStatus: 400, retryable: false },
  QUESTION_MARKS_INVALID: { httpStatus: 400, retryable: false },
  // QUESTION_OUT_OF_SCOPE: the actor holds no active TeacherAssignment
  // covering this question's (subjectId, level) pair (ADR-0001 §2) — a
  // domain-rule failure distinct from the authorization engine's own
  // FORBIDDEN (that's "you can never do this"; this is "your assignment
  // doesn't cover this specific subject/level combination").
  QUESTION_OUT_OF_SCOPE: { httpStatus: 400, retryable: false },
  // QUESTION_REVISION_NOT_DRAFT: PATCH / submit / media-attach attempted on
  // a revision that isn't DRAFT.
  QUESTION_REVISION_NOT_DRAFT: { httpStatus: 409, retryable: false },
  // QUESTION_REVISION_NOT_REVISABLE: POST .../revisions attempted from a
  // source revision that is neither APPROVED nor REJECTED.
  QUESTION_REVISION_NOT_REVISABLE: { httpStatus: 409, retryable: false },
  // QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE: questionBank.import's grant
  // is wider than Teacher (Moderator/HOD/School Admin can all call the
  // endpoint), but Question.authorTeacherProfileId is a required FK — an
  // uploader with no TeacherProfile in this school structurally cannot
  // author the questions their own import would create. Rejected at
  // job-creation time, mirroring B7's own "reject a bad
  // academicSessionId immediately, naming the real problem" precedent,
  // rather than letting every row fail individually.
  QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE: { httpStatus: 400, retryable: false },

  // B9 (Question Review & Governance). Mandatory-reason enforcement for
  // reject/request-changes is a DTO-level @IsNotEmpty() check (generic
  // VALIDATION_ERROR), mirroring QUESTION_CORRECT_ANSWER_MISSING's own
  // precedent of preferring a decorator over a bespoke code when one
  // already covers the rule — these two codes are for the rules a decorator
  // can't express.
  //
  // QUESTION_REVISION_NOT_SUBMITTED: approve/reject/request-changes
  // attempted on a revision that isn't SUBMITTED or UNDER_REVIEW — the
  // resource-state guard mirroring QUESTION_REVISION_NOT_DRAFT's own shape.
  QUESTION_REVISION_NOT_SUBMITTED: { httpStatus: 409, retryable: false },
  // QUESTION_SELF_REVIEW_FORBIDDEN: the deciding HOD is also this
  // question's own author (07 §5.3 permits holding both roles; B9's
  // roadmap Security work requires blocking it as a distinct rule) — a
  // domain-rule failure distinct from the authorization engine's own
  // FORBIDDEN, mirroring QUESTION_OUT_OF_SCOPE's exact reasoning.
  QUESTION_SELF_REVIEW_FORBIDDEN: { httpStatus: 400, retryable: false },

  // B11 (Exam Builder & Readiness).
  //
  // EXAM_OUT_OF_SCOPE: the actor holds no active TeacherAssignment covering
  // ANY of the exam's targeted classes (ADR-0013's "at least one" rule) —
  // mirrors QUESTION_OUT_OF_SCOPE's exact reasoning, widened from one
  // candidate to N.
  EXAM_OUT_OF_SCOPE: { httpStatus: 400, retryable: false },
  // EXAM_REQUIRES_TEACHER_PROFILE: exam.create is reachable only by an actor
  // holding TEACHER (exam.create is denied for every other role in the
  // frozen permission table), so this is a defensive data-integrity check,
  // not a real authorization gap — but it needs its own code/message rather
  // than reusing QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE's (that one is
  // about authoring questions/imports, not exams, and would surface a
  // wrongly-labelled message here).
  EXAM_REQUIRES_TEACHER_PROFILE: { httpStatus: 400, retryable: false },
  // EXAM_TERM_SESSION_MISMATCH: the given academicTermId doesn't belong to
  // the given academicSessionId.
  EXAM_TERM_SESSION_MISMATCH: { httpStatus: 400, retryable: false },
  // EXAM_CLASS_SUBJECT_NOT_OFFERED: a targeted classId has no ACTIVE
  // ClassSubject row for the exam's own subjectId — this subject isn't
  // taught to that class in this session at all, so no teacher assignment
  // and no eligible student could ever exist for it.
  EXAM_CLASS_SUBJECT_NOT_OFFERED: { httpStatus: 400, retryable: false },
  // EXAM_CLASS_SESSION_MISMATCH: a targeted class's own ClassSubject
  // resolves to a different academicSessionId than the exam's.
  EXAM_CLASS_SESSION_MISMATCH: { httpStatus: 400, retryable: false },
  // EXAM_CLASS_LEVEL_MISMATCH: ADR-0013 — every targeted class must share
  // one ClassGroup.level; two arms of different levels cannot sit the same
  // exam (questions are level-scoped, ADR-0001).
  EXAM_CLASS_LEVEL_MISMATCH: { httpStatus: 400, retryable: false },
  // EXAM_REVISION_NOT_APPROVED: a questionRevisionId in the selection DTO
  // does not currently resolve to an APPROVED revision — the service-layer
  // half of DoD item 2 (the database trigger is the other, unconditional
  // half — see this migration's own hand-written SQL).
  EXAM_REVISION_NOT_APPROVED: { httpStatus: 400, retryable: false },
  // EXAM_QUESTION_OUT_OF_SCOPE: a bound/to-be-bound revision's own Question
  // doesn't match the exam's subject or targeted-class level.
  EXAM_QUESTION_OUT_OF_SCOPE: { httpStatus: 400, retryable: false },
  // EXAM_MARKS_INVALID: a marks override in PUT .../questions is <= 0.
  EXAM_MARKS_INVALID: { httpStatus: 400, retryable: false },
  // EXAM_NOT_DRAFT: a DRAFT-only mutation (edit, delete, set questions, set
  // configuration) was attempted on an exam that has already left DRAFT —
  // the service-layer half of DoD item 6 (the database triggers are the
  // unconditional other half).
  EXAM_NOT_DRAFT: { httpStatus: 409, retryable: false },
  // EXAM_NOT_READY: POST .../ready's own readiness re-check failed — the
  // response's `details` carries the full itemised checklist (05 §72) so
  // the client never needs a second round-trip to learn why.
  EXAM_NOT_READY: { httpStatus: 409, retryable: false },
  // EXAM_NOT_CANCELLABLE: POST .../cancel attempted from a status other
  // than DRAFT or READY (07 §14's own transition table).
  EXAM_NOT_CANCELLABLE: { httpStatus: 409, retryable: false },
  // EXAM_NOT_ARCHIVABLE: POST .../archive attempted from OPEN/CLOSED/
  // COMPLETED — those states don't exist yet in this phase (B12/B13
  // produce them), but the guard is real regardless of how a row reaches
  // one; DRAFT/READY/CANCELLED/ARCHIVED are all archivable, matching this
  // codebase's general "archival always allowed" convention.
  EXAM_NOT_ARCHIVABLE: { httpStatus: 409, retryable: false },

  // B12 (Exam Activation & Control).
  // EXAM_NOT_OPEN: POST .../exams/:id/close attempted while the exam is not
  // currently OPEN.
  EXAM_NOT_OPEN: { httpStatus: 409, retryable: false },
  // EXAM_NOT_CLOSED: POST .../exams/:id/reopen attempted while the exam is
  // not currently CLOSED.
  EXAM_NOT_CLOSED: { httpStatus: 409, retryable: false },
  // EXAM_NOT_OPENABLE: POST .../exams/:id/sessions attempted against an
  // exam not in READY or OPEN (e.g. still DRAFT, or CLOSED/COMPLETED/
  // CANCELLED/ARCHIVED — reopen the exam first if it's CLOSED).
  EXAM_NOT_OPENABLE: { httpStatus: 409, retryable: false },
  // EXAM_SESSION_NOT_OPEN: POST .../exam-sessions/:id/close attempted on a
  // session that is not currently OPEN.
  EXAM_SESSION_NOT_OPEN: { httpStatus: 409, retryable: false },
  // EXAM_SESSION_NOT_CLOSED: POST .../exam-sessions/:id/reopen attempted on
  // a session that is not currently CLOSED.
  EXAM_SESSION_NOT_CLOSED: { httpStatus: 409, retryable: false },
  // EXAM_SESSION_NOT_AUTHORIZABLE: POST .../participants attempted against
  // a COMPLETED or CANCELLED session — authorization bookkeeping is
  // allowed while OPEN or CLOSED only (DoD item 4: a second batch after
  // closing the first needs no new exam).
  EXAM_SESSION_NOT_AUTHORIZABLE: { httpStatus: 409, retryable: false },
  // EXAM_SESSION_PARTICIPANT_NOT_AUTHORIZED: DELETE .../participants/
  // :studentId attempted against a participant who is not currently
  // AUTHORIZED (already revoked, or never authorized).
  EXAM_SESSION_PARTICIPANT_NOT_AUTHORIZED: { httpStatus: 409, retryable: false },
  // REVOKE_AFTER_START_REFUSED: X-13/this phase's own Security section —
  // revoking access is permitted only before an attempt starts; afterwards
  // the correct action is invalidation (B13), never a plain revoke. B12's
  // own hasStartedAttempt() stub always returns false (no ExamAttempt
  // exists yet), so this branch is currently unreachable — kept real and
  // tested regardless, since B13 supersedes the stub without needing to
  // add this code retroactively.
  REVOKE_AFTER_START_REFUSED: { httpStatus: 409, retryable: false },
  // EXAM_SESSIONS_STILL_OPEN: POST .../exams/:id/complete attempted while
  // at least one ExamSession is still OPEN (A-14: End Examination is a
  // deliberate, explicit action, never automatic).
  EXAM_SESSIONS_STILL_OPEN: { httpStatus: 409, retryable: false },
  // EXAM_HAS_IN_PROGRESS_ATTEMPTS: End Examination's other A-14 precondition
  // — zero IN_PROGRESS attempts. B12's own countInProgressAttempts() stub
  // always returns 0 (no ExamAttempt exists yet), so unreachable until B13
  // supersedes it; kept real for the same reason as REVOKE_AFTER_START_
  // REFUSED above.
  EXAM_HAS_IN_PROGRESS_ATTEMPTS: { httpStatus: 409, retryable: false },
  // EXAM_NOT_COMPLETABLE: the exam's own status no longer permits
  // completion at all (e.g. a second POST .../complete call against an
  // exam already COMPLETED) — the conditional-updateMany idiom's own
  // count===0 fallback, distinct from the two named preconditions above.
  EXAM_NOT_COMPLETABLE: { httpStatus: 409, retryable: false },
  // STALE_ABSENTEE_LIST: the confirmedAbsentStudentMembershipIds submitted
  // to POST .../complete doesn't exactly match the server's own current
  // pending-absentee set — forces the client to have called GET .../control
  // first rather than confirming a list computed from stale data.
  STALE_ABSENTEE_LIST: { httpStatus: 409, retryable: false },
  // EXAM_ADMINISTRATOR_REQUIRES_ACTIVE_MEMBERSHIP: POST .../administrators
  // named a membershipId with no active SchoolMembership at this school —
  // mirrors HOD_PROMOTION_REQUIRES_ACTIVE_TEACHER_ROLE's own B6 naming
  // precedent for this class of "the target doesn't structurally qualify"
  // check.
  EXAM_ADMINISTRATOR_REQUIRES_ACTIVE_MEMBERSHIP: { httpStatus: 400, retryable: false },

  // B13 (Attempt Engine).
  // ATTEMPT_NOT_ELIGIBLE: POST .../exams/:id/attempts attempted by a
  // student who fails the re-validated-under-lock eligibility predicate
  // (enrollment, subject registration, session accessibility, or attempt-
  // limit headroom — `evaluateAttemptStartEligibility`). `details.
  // failedChecks` carries the full itemised set, mirroring EXAM_NOT_READY's
  // own "never make the client guess" precedent.
  ATTEMPT_NOT_ELIGIBLE: { httpStatus: 409, retryable: false },
  // ATTEMPT_NOT_WRITABLE: any write attempted (answer save, batch flush,
  // submit, staff end) against an attempt whose `state` is no longer
  // IN_PROGRESS — the service-layer fast-fail half of the same guarantee
  // `attempt_answers_immutable_when_attempt_not_in_progress` and
  // `exam_attempts_status_transition_guard` enforce unconditionally at the
  // database level (ADR-0007: "answers become immutable after submission").
  ATTEMPT_NOT_WRITABLE: { httpStatus: 409, retryable: false },
  // ATTEMPT_WRITE_WINDOW_CLOSED: an answer write (or submit) arrived more
  // than ADR-0003's grace window (default 60s, env-configurable, never
  // per-school) after `expires_at` — server receipt time, never a
  // client-supplied timestamp, is what this is measured against.
  // Deliberately non-retryable: the offline client must drop this write,
  // not retry it forever (ADR-0003's own explicit requirement).
  ATTEMPT_WRITE_WINDOW_CLOSED: { httpStatus: 409, retryable: false },
  // ATTEMPT_ANSWER_SEQUENCE_STALE: an answer write's client-assigned
  // sequenceNumber is <= the value already stored for this (attempt,
  // question) — ADR-0007's ordering protection (resolves X-04). Rejected
  // WITHOUT writing anything, so an out-of-order offline replay can never
  // silently overwrite a newer answer. Non-retryable: retrying the exact
  // same stale write can never succeed.
  ATTEMPT_ANSWER_SEQUENCE_STALE: { httpStatus: 409, retryable: false },
  // ATTEMPT_QUESTION_NOT_IN_SNAPSHOT: an answer write named an
  // examQuestionId/selectedOptionId that does not appear in this attempt's
  // own frozen AttemptQuestionSnapshot.document — never silently accepted.
  ATTEMPT_QUESTION_NOT_IN_SNAPSHOT: { httpStatus: 400, retryable: false },
  // EXAM_SESSION_PARTICIPANT_NOT_FOUND: POST .../extra-time (decision 2,
  // accommodations) named a student with no ExamSessionParticipant row for
  // this session at all — distinct from EXAM_SESSION_PARTICIPANT_NOT_
  // AUTHORIZED (B12), which means a row exists but isn't currently
  // AUTHORIZED; extra time may be granted regardless of current
  // AUTHORIZED/REVOKED status (it's frozen at attempt creation, not at
  // grant time), so only "no row exists" is rejected here.
  EXAM_SESSION_PARTICIPANT_NOT_FOUND: { httpStatus: 404, retryable: false },
} as const;

export type BaseErrorCode = keyof typeof BASE_ERROR_CODES;

export function isKnownBaseErrorCode(code: string): code is BaseErrorCode {
  return Object.prototype.hasOwnProperty.call(BASE_ERROR_CODES, code);
}
