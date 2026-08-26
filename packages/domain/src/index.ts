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
