import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Enter your username or student ID.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

/** `PlatformLoginDto` authenticates by email, not a school-scoped
 * `login_identifier` — a distinct schema from `loginSchema` rather than a
 * shared "identifier" field, since the two are genuinely different inputs
 * server-side (apps/api/src/modules/platform/dto/platform-login.dto.ts). */
export const platformLoginSchema = z.object({
  email: z.string().min(1, 'Enter your email.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type PlatformLoginValues = z.infer<typeof platformLoginSchema>;

/** F20 (B20 MFA) — the second sign-in step and enrolment confirmation:
 * a 6-digit TOTP code (`MfaVerifyDto.otp`, `/^\d{6}$/`). Spaces are
 * tolerated in input (authenticator apps show "123 456"). */
export const otpSchema = z.object({
  otp: z
    .string()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.')),
});
export type OtpValues = z.input<typeof otpSchema>;

/** A one-time recovery code (`xxxx-xxxx-xxxx-xxxx`; the server normalises
 * case and whitespace). */
export const recoveryCodeSchema = z.object({
  recoveryCode: z
    .string()
    .trim()
    .min(16, 'Enter one of your recovery codes.')
    .max(32, 'Enter one of your recovery codes.'),
});
export type RecoveryCodeValues = z.infer<typeof recoveryCodeSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Enter your username or staff ID.'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

// 10 mirrors PasswordChangeDto/PasswordResetConfirmDto's server-side
// @MinLength(10) (apps/api/src/modules/identity/dto) — NIST 800-63B
// length-over-composition minimum, per audit finding A-02's recommended
// interpretation. Kept in sync manually; the server is still the real
// enforcement point.
const NEW_PASSWORD_MIN_LENGTH = 10;
// Exported for F4's /activate screen, which needs the identical
// new-password-with-match-refine shape but isn't a password *reset* (no
// token) — building its own local schema from this field rather than
// duplicating NEW_PASSWORD_MIN_LENGTH a second time.
export const newPasswordField = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH, `Password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters.`);

export const resetPasswordSchema = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: newPasswordField,
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * A pending-first-login account (`credentialState !== 'OK'`) has no
 * current password of its own choosing to confirm — `PasswordChangeDto`'s
 * own doc comment is explicit that `currentPassword` is optional exactly
 * for that case. `requireCurrent` mirrors that same branch client-side so
 * the form only asks for it when the server will actually require it.
 */
export function buildChangePasswordSchema(requireCurrent: boolean) {
  return z
    .object({
      currentPassword: requireCurrent
        ? z.string().min(1, 'Enter your current password.')
        : z.string().optional(),
      newPassword: newPasswordField,
      confirmPassword: newPasswordField,
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    });
}
export type ChangePasswordValues = z.infer<ReturnType<typeof buildChangePasswordSchema>>;
