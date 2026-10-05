import { describe, expect, it } from 'vitest';
import {
  formatSender,
  platformSettingDefaults,
  resolvePlatformSettings,
  validatePlatformSetting,
  type PlatformSettingsEnv,
} from './platform-settings.js';

const env: PlatformSettingsEnv = {
  PRODUCT_NAME: 'Product',
  NOTIFICATION_TRANSPORT: 'smtp',
  OPS_ALERT_EMAILS: 'a@x.test, b@x.test',
  SMTP_FROM_ADDRESS: 'Product <noreply@mail.example.com>',
  SES_FROM_ADDRESS: '',
  DEFAULT_SCHOOL_TIMEZONE: 'Africa/Lagos',
  PLATFORM_SESSION_TTL_SECONDS: 8 * 3600,
  PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS: 1800,
  SESSION_TTL_SECONDS: 7 * 86400,
  AUTH_LOCKOUT_MAX_ATTEMPTS: 5,
  AUTH_LOCKOUT_WINDOW_SECONDS: 900,
  PASSWORD_RESET_TOKEN_TTL_SECONDS: 3600,
};

describe('platform settings (ADR-0036)', () => {
  it('defaults come from the env file', () => {
    const d = platformSettingDefaults(env);
    expect(d.opsAlertEmails).toEqual(['a@x.test', 'b@x.test']);
    // The env sender's own display name wins over the product name.
    expect(d.emailSenderName).toBe('Product');
    expect(
      platformSettingDefaults({ ...env, SMTP_FROM_ADDRESS: '"Exams Desk" <a@mail.example.com>' })
        .emailSenderName,
    ).toBe('Exams Desk');
    expect(
      platformSettingDefaults({ ...env, SMTP_FROM_ADDRESS: 'a@mail.example.com' }).emailSenderName,
    ).toBe('Product');
    expect(d.emailSenderAddress).toBe('noreply@mail.example.com');
    expect(d.authLockoutMaxAttempts).toBe(5);
  });

  it('enforces each limit', () => {
    expect(validatePlatformSetting('authLockoutMaxAttempts', 2, env).ok).toBe(false);
    expect(validatePlatformSetting('authLockoutMaxAttempts', 21, env).ok).toBe(false);
    expect(validatePlatformSetting('authLockoutMaxAttempts', 3.5, env).ok).toBe(false);
    expect(validatePlatformSetting('authLockoutMaxAttempts', 20, env)).toEqual({
      ok: true,
      value: 20,
    });
    expect(validatePlatformSetting('platformSessionIdleTimeoutSeconds', 60, env).ok).toBe(false);
    expect(validatePlatformSetting('schoolSessionTtlSeconds', 31 * 86400, env).ok).toBe(false);
    expect(validatePlatformSetting('defaultSchoolTimezone', 'Mars/Base', env).ok).toBe(false);
    expect(validatePlatformSetting('defaultSchoolTimezone', 'Africa/Accra', env).ok).toBe(true);
    expect(validatePlatformSetting('emailSenderName', 'Evil <x@y>', env).ok).toBe(false);
    expect(validatePlatformSetting('emailSenderName', '', env).ok).toBe(false);
    expect(
      validatePlatformSetting(
        'opsAlertEmails',
        Array.from({ length: 11 }, (_, i) => `o${i}@x.test`),
        env,
      ).ok,
    ).toBe(false);
  });

  it('keeps the sender on the verified domain', () => {
    expect(validatePlatformSetting('emailSenderAddress', 'info@mail.example.com', env)).toEqual({
      ok: true,
      value: 'info@mail.example.com',
    });
    expect(validatePlatformSetting('emailSenderAddress', 'info@example.com', env).ok).toBe(false);
  });

  it('lays valid stored values over the defaults and ignores the rest', () => {
    const resolved = resolvePlatformSettings(env, [
      { key: 'authLockoutMaxAttempts', value: 8 },
      { key: 'schoolSessionTtlSeconds', value: 10 },
      { key: 'notASetting', value: 1 },
    ]);
    expect(resolved.values.authLockoutMaxAttempts).toBe(8);
    expect(resolved.values.schoolSessionTtlSeconds).toBe(7 * 86400);
    expect(resolved.overridden).toEqual(['authLockoutMaxAttempts']);
    expect(resolved.ignored).toEqual(['schoolSessionTtlSeconds']);
  });

  it('formats the From header', () => {
    expect(formatSender({ emailSenderName: 'Pilot', emailSenderAddress: 'a@x.test' })).toBe(
      '"Pilot" <a@x.test>',
    );
    expect(formatSender({ emailSenderName: 'Pilot', emailSenderAddress: '' })).toBe('');
  });
});
