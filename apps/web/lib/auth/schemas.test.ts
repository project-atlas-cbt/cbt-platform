import { describe, expect, it } from 'vitest';
import {
  buildChangePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schemas';

describe('loginSchema', () => {
  it('accepts a non-empty identifier and password', () => {
    expect(loginSchema.safeParse({ identifier: 'ST001', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty identifier or password', () => {
    expect(loginSchema.safeParse({ identifier: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'ST001', password: '' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('rejects an empty identifier', () => {
    expect(forgotPasswordSchema.safeParse({ identifier: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts matching passwords at least 10 characters long', () => {
    expect(
      resetPasswordSchema.safeParse({ newPassword: '0123456789', confirmPassword: '0123456789' })
        .success,
    ).toBe(true);
  });

  it('rejects a password shorter than 10 characters', () => {
    expect(
      resetPasswordSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });

  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      newPassword: '0123456789',
      confirmPassword: '9876543210',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });
});

describe('buildChangePasswordSchema', () => {
  it('requires currentPassword when requireCurrent is true', () => {
    const schema = buildChangePasswordSchema(true);
    expect(
      schema.safeParse({ newPassword: '0123456789', confirmPassword: '0123456789' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        currentPassword: 'old',
        newPassword: '0123456789',
        confirmPassword: '0123456789',
      }).success,
    ).toBe(true);
  });

  it('allows omitting currentPassword when requireCurrent is false', () => {
    const schema = buildChangePasswordSchema(false);
    expect(
      schema.safeParse({ newPassword: '0123456789', confirmPassword: '0123456789' }).success,
    ).toBe(true);
  });
});
