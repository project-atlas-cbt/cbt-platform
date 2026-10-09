export { ROLES, PLATFORM_ROLES, SCHOOL_ROLES, type Role } from './roles.js';
export { BASE_ERROR_CODES, isKnownBaseErrorCode, type BaseErrorCode } from './error-codes.js';
export { SCOPE_PREDICATES, type ScopePredicate } from './authorization/scope.js';
export { PERMISSION_ACTIONS, type PermissionAction } from './authorization/action.js';
export {
  granted,
  denied,
  breakGlass,
  system,
  deferred,
  limitedReadOnly,
  type Grant,
} from './authorization/grant.js';
export {
  PERMISSION_TABLE,
  findPermissionRule,
  requirePermissionRule,
  type PermissionRule,
  type PermissionSection,
} from './authorization/permission-table.js';
export {
  SCHOOL_STATUSES,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_EXPIRY_GRACE_DAYS,
  SUBSCRIPTION_WARNING_THRESHOLD_DAYS,
  SUBSCRIPTION_EXPIRING_WINDOW_DAYS,
  resolveSchoolStatus,
  resolveAccessGate,
  meetsCapability,
  type SchoolStatus,
  type SubscriptionStatus,
  type PlatformOverride,
  type AccessCapability,
  type AccessGateInput,
  type AccessGateResult,
} from './platform/access-gate.js';
export {
  PLATFORM_METRICS_CACHE_KEY,
  type PlatformMetricsSnapshot,
} from './platform/metrics-cache.js';
export {
  examControlChannel,
  examControlStreamKey,
  decodeExamControlEvent,
  encodeExamControlEvent,
  LOAD_SHED_SIGNAL_KEY,
  EXAM_CONTROL_ACTIVE_SET_KEY,
  EXAM_CONTROL_CACHE_TTL_SECONDS,
  DISCONNECTED_AFTER_MS,
  isDisconnected,
  attemptSignalCounts,
  type AttemptSignalCounts,
  type ExamLiveAttemptSnapshot,
  type ExamControlCenterAggregateSnapshot,
  type ExamControlCenterSessionSnapshot,
  type ExamControlCenterSnapshot,
  type ExamControlCenterStalenessSnapshot,
} from './exam-control/control-cache.js';
export {
  RESULT_POLICIES,
  RESULT_DETAIL_VISIBILITIES,
  effectiveResultSettings,
  type ResultPolicy,
  type ResultDetailVisibility,
  type SchoolResultSettings,
  type ExamResultSettings,
} from './platform/result-policy.js';
export {
  derivePalette,
  type BrandTokens,
  type NeutralTokens,
  type PaletteAdjustment,
  type DerivedPalette,
} from './branding/derive-palette.js';
export {
  ORPHAN_MEDIA_REPORT_CACHE_KEY,
  type OrphanMediaReportSnapshot,
} from './media/orphan-media-report.js';
export {
  ACADEMIC_SESSION_STATUSES,
  ACADEMIC_TERM_STATUSES,
  DEPARTMENT_STATUSES,
  STREAM_STATUSES,
  CLASS_LEVELS,
  CLASS_GROUP_STATUSES,
  SUBJECT_STATUSES,
  CLASS_SUBJECT_STATUSES,
  CLASS_SUBJECT_KINDS,
  HOD_ASSIGNMENT_STATUSES,
  ROLLOVER_PLAN_STATUSES,
  ROLLOVER_OUTCOMES,
  type AcademicSessionStatus,
  type AcademicTermStatus,
  type DepartmentStatus,
  type StreamStatus,
  type ClassLevel,
  type ClassGroupStatus,
  type SubjectStatus,
  type ClassSubjectStatus,
  type ClassSubjectKind,
  type HODAssignmentStatus,
  type RolloverPlanStatus,
  type RolloverOutcome,
} from './academics/constants.js';
export {
  choiceGroupWarnings,
  describeRule,
  type ChoiceGroupRule,
  type ChoiceGroupWarning,
} from './academics/choice-rules.js';
export {
  STANDARD_CHOICE_GROUPS,
  STANDARD_DEPARTMENTS,
  STANDARD_STREAMS,
  STANDARD_SUBJECTS,
  type StandardChoiceGroup,
  type StandardDepartment,
  type StandardSetupStage,
  type StandardStream,
  type StandardSubject,
} from './academics/standard-setup.js';
export {
  USER_STATUSES,
  STUDENT_PROFILE_STATUSES,
  EMPLOYMENT_STATUSES,
  STUDENT_ENROLLMENT_STATUSES,
  TEACHER_ASSIGNMENT_STATUSES,
  STUDENT_SUBJECT_REGISTRATION_STATUSES,
  MEMBERSHIP_STATUSES,
  type UserStatus,
  type StudentProfileStatus,
  type EmploymentStatus,
  type StudentEnrollmentStatus,
  type TeacherAssignmentStatus,
  type StudentSubjectRegistrationStatus,
  type MembershipStatus,
} from './people/constants.js';
export {
  IMPORT_JOB_TYPES,
  IMPORT_JOB_STATUSES,
  IMPORT_ROW_STATUSES,
  type ImportJobType,
  type ImportJobStatus,
  type ImportRowStatus,
} from './imports/constants.js';
export {
  QUESTION_TYPES,
  QUESTION_DIFFICULTIES,
  QUESTION_REVISION_STATUSES,
  QUESTION_REVIEW_DECISIONS,
  QUESTION_REVIEW_FALLBACK_REASONS,
  type QuestionReviewFallbackReason,
  type QuestionType,
  type QuestionDifficulty,
  type QuestionRevisionStatus,
  type QuestionReviewDecision,
} from './questions/constants.js';
export {
  EXAM_STATUSES,
  EXAM_ACCESS_MODES,
  EXAM_NAVIGATION_POLICIES,
  EXAM_READINESS_CHECK_CODES,
  EXAM_SESSION_TYPES,
  EXAM_SESSION_STATUSES,
  EXAM_SESSION_PARTICIPANT_STATUSES,
  EXAM_PARTICIPATION_STATUSES,
  EXAM_ADMINISTRATOR_STATUSES,
  ATTEMPT_AUTHORIZATION_TYPES,
  ATTEMPT_AUTHORIZATION_STATUSES,
  type ExamStatus,
  type ExamAccessMode,
  type ExamNavigationPolicy,
  type ExamReadinessCheckCode,
  type ExamSessionType,
  type ExamSessionStatus,
  type ExamSessionParticipantStatus,
  type ExamParticipationStatus,
  type ExamAdministratorStatus,
  type AttemptAuthorizationType,
  type AttemptAuthorizationStatus,
  ATTEMPT_STATES,
  ATTEMPT_TYPES,
  ATTEMPT_ANSWER_STATES,
  ATTEMPT_EVENT_TYPES,
  ATTEMPT_QUESTION_CORRECTNESS_VALUES,
  type AttemptState,
  type AttemptType,
  type AttemptAnswerState,
  type AttemptEventType,
  type AttemptQuestionCorrectness,
  MAX_EXAM_DURATION_SECONDS,
  MAX_EXAM_ATTEMPT_LIMIT,
} from './exams/constants.js';
export {
  CANONICAL_AUDIT_ACTIONS,
  DEFERRED_AUDIT_ACTION_IDS,
  type CanonicalAuditAction,
} from './audit/vocabulary.js';
export {
  NOTIFICATION_TYPES,
  DEFERRED_NOTIFICATION_TYPES,
  NOTIFICATION_STATUSES,
  type NotificationType,
  type NotificationStatus,
} from './notifications/constants.js';
export {
  attemptGraceWindowSeconds,
  evaluateWriteAdmissibility,
  type AttemptWriteAdmissibility,
} from './execution/attempt-admissibility.js';
export {
  CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
  computeAttemptQuestionMarkingResults,
  type AttemptSnapshotOptionV1,
  type AttemptSnapshotMediaV1,
  type AttemptSnapshotQuestionV1,
  type AttemptSnapshotDocumentV1,
  type AttemptAnswerForMarking,
  type AttemptQuestionMarkingResult,
} from './execution/attempt-marking.js';
export {
  ATTEMPT_MARKING_QUEUE_NAME,
  type AttemptMarkingJobPayload,
} from './execution/attempt-marking-queue.js';
export { FAILED_JOB_RETENTION } from './jobs/job-retention.js';
export {
  EXAM_MEDIA_PRECACHE_QUEUE_NAME,
  type ExamMediaPrecacheJobPayload,
} from './execution/media-precache-queue.js';
export {
  rollUpExamParticipation,
  rollUpParticipation,
  type ParticipationRollupInput,
} from './execution/participation.js';
export {
  computePercentage,
  computeResultTotals,
  type ResultQuestionMarking,
  type ResultTotals,
} from './results/result-totals.js';
export {
  DEFAULT_GRADING_SCALE_NAME,
  DEFAULT_GRADING_SCALE_TEMPLATE,
  resolveGradeBand,
  validateGradingBands,
  type GradingBand,
  type ResolvedGrade,
  type GradingBandValidationIssue,
} from './results/grading-scale.js';
export {
  RESULT_STATES,
  NON_VOIDED_RESULT_STATES,
  AGGREGATABLE_RESULT_STATES,
  STUDENT_VISIBLE_RESULT_STATES,
  resolveStudentResultVisibility,
  isResultVisibleToStudent,
  type ResultState,
  type StudentResultVisibilityInput,
  type StudentResultVisibilityReason,
} from './results/result-visibility.js';
export {
  RESULT_ADJUSTMENT_TYPES,
  applyResultAdjustment,
  toAdjustableValues,
  replayOriginalValues,
  type ResultAdjustmentType,
  type AdjustableResultValues,
  type ResultAdjustmentSpec,
} from './results/result-adjustment.js';
export {
  RESULT_ADJUSTMENT_QUEUE_NAME,
  RESULT_ADJUSTMENT_CLAIM_TTL_MS,
  RESULT_ADJUSTMENT_CHUNK_SIZE,
  type ResultAdjustmentJobPayload,
} from './results/result-adjustment-queue.js';
export {
  EXPORT_QUEUE_NAME,
  EXPORT_EXPIRY_QUEUE_NAME,
  EXPORT_ARTEFACT_TTL_MS,
  type ExportJobPayload,
} from './reporting/export-queue.js';
export {
  RETENTION_SCHEDULE,
  retentionRule,
  type RetentionRule,
  type RetentionAction,
} from './compliance/retention.js';
export {
  formalName,
  naturalName,
  normaliseMiddleName,
  compareText,
  comparePersonNames,
  sortByPersonName,
  type PersonNameParts,
} from './people/names.js';
