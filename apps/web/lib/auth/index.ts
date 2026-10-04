export { AuthProvider, useAuth } from './auth-context';
export {
  PlatformAuthProvider,
  usePlatformAuth,
  type PlatformLoginResult,
} from './platform-auth-context';
export { resolveLandingRoute } from './role-priority';
export { resolveLoginErrorMessage } from './resolve-login-error';
// Form schemas (zod) are imported from './schemas' directly, never through
// this barrel: every route guard imports the barrel, and re-exporting them
// here put zod in every route's first load, the exam's included (F20).
export type {
  AuthMe,
  AuthStatus,
  CurrentMembership,
  CurrentUser,
  PlatformCurrentUser,
  PlatformAuthStatus,
  PlatformMe,
} from './types';
