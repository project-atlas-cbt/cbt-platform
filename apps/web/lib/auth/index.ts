export { AuthProvider, useAuth } from './auth-context';
export { PlatformAuthProvider, usePlatformAuth } from './platform-auth-context';
export { resolveLandingRoute } from './role-priority';
export {
  buildChangePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordField,
  platformLoginSchema,
  resetPasswordSchema,
  type ChangePasswordValues,
  type ForgotPasswordValues,
  type LoginValues,
  type PlatformLoginValues,
  type ResetPasswordValues,
} from './schemas';
export type {
  AuthMe,
  AuthStatus,
  CurrentMembership,
  CurrentUser,
  PlatformCurrentUser,
  PlatformAuthStatus,
  PlatformMe,
} from './types';
