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
  RESULT_POLICIES,
  RESULT_DETAIL_VISIBILITIES,
  type ResultPolicy,
  type ResultDetailVisibility,
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
  CLASS_LEVELS,
  CLASS_GROUP_STATUSES,
  SUBJECT_STATUSES,
  CLASS_SUBJECT_STATUSES,
  HOD_ASSIGNMENT_STATUSES,
  type AcademicSessionStatus,
  type AcademicTermStatus,
  type DepartmentStatus,
  type ClassLevel,
  type ClassGroupStatus,
  type SubjectStatus,
  type ClassSubjectStatus,
  type HODAssignmentStatus,
} from './academics/constants.js';
export {
  USER_STATUSES,
  STUDENT_PROFILE_STATUSES,
  EMPLOYMENT_STATUSES,
  STUDENT_ENROLLMENT_STATUSES,
  TEACHER_ASSIGNMENT_STATUSES,
  STUDENT_SUBJECT_REGISTRATION_STATUSES,
  type UserStatus,
  type StudentProfileStatus,
  type EmploymentStatus,
  type StudentEnrollmentStatus,
  type TeacherAssignmentStatus,
  type StudentSubjectRegistrationStatus,
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
  type ExamStatus,
  type ExamAccessMode,
  type ExamNavigationPolicy,
  type ExamReadinessCheckCode,
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
