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
