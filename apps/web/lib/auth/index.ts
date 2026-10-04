export { AuthProvider, useAuth } from './auth-context';
export {
  PlatformAuthProvider,
  usePlatformAuth,
  type PlatformLoginResult,
} from './platform-auth-context';
export { resolveLandingRoute } from './role-priority';
export { resolveLoginErrorMessage } from './resolve-login-error';
export {
  buildChangePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordField,
  otpSchema,
  platformLoginSchema,
  recoveryCodeSchema,
  resetPasswordSchema,
  type ChangePasswordValues,
  type ForgotPasswordValues,
  type LoginValues,
  type OtpValues,
  type RecoveryCodeValues,
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
