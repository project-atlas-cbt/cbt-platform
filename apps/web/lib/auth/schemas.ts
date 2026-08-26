import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Enter your username or student ID.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

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
const newPasswordField = z
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
