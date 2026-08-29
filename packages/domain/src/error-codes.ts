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
} as const;

export type BaseErrorCode = keyof typeof BASE_ERROR_CODES;

export function isKnownBaseErrorCode(code: string): code is BaseErrorCode {
  return Object.prototype.hasOwnProperty.call(BASE_ERROR_CODES, code);
}
