import type { Env } from './env.schema.js';
import { getProductName } from './product.js';

/**
 * ADR-0036: the platform settings a Software Admin may change from System
 * Configuration. The env file supplies every default, so a setting with no
 * stored value behaves exactly as before; a stored value overrides it within
 * the limits below. This list is the whole of what is editable — adding to
 * it needs an ADR-0036 amendment.
 */

export type PlatformSettingKey =
  | 'opsAlertEmails'
  | 'emailSenderName'
  | 'emailSenderAddress'
  | 'defaultSchoolTimezone'
  | 'platformSessionTtlSeconds'
  | 'platformSessionIdleTimeoutSeconds'
  | 'schoolSessionTtlSeconds'
  | 'authLockoutMaxAttempts'
  | 'authLockoutWindowSeconds'
  | 'passwordResetTokenTtlSeconds';

export interface PlatformSettings {
  opsAlertEmails: string[];
  emailSenderName: string;
  emailSenderAddress: string;
  defaultSchoolTimezone: string;
  platformSessionTtlSeconds: number;
  platformSessionIdleTimeoutSeconds: number;
  schoolSessionTtlSeconds: number;
  authLockoutMaxAttempts: number;
  authLockoutWindowSeconds: number;
  passwordResetTokenTtlSeconds: number;
}

export type PlatformSettingKind =
  'emailList' | 'text' | 'email' | 'timezone' | 'duration' | 'count';

/** How the console shows and edits a duration (stored in seconds). */
export type DurationUnit = 'minutes' | 'hours' | 'days';

export type PlatformSettingsEnv = Pick<
  Env,
  | 'PRODUCT_NAME'
  | 'NOTIFICATION_TRANSPORT'
  | 'OPS_ALERT_EMAILS'
  | 'SMTP_FROM_ADDRESS'
  | 'SES_FROM_ADDRESS'
  | 'DEFAULT_SCHOOL_TIMEZONE'
  | 'PLATFORM_SESSION_TTL_SECONDS'
  | 'PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS'
  | 'SESSION_TTL_SECONDS'
  | 'AUTH_LOCKOUT_MAX_ATTEMPTS'
  | 'AUTH_LOCKOUT_WINDOW_SECONDS'
  | 'PASSWORD_RESET_TOKEN_TTL_SECONDS'
>;

export interface PlatformSettingDefinition {
  key: PlatformSettingKey;
  group: 'operations' | 'sign-in';
  label: string;
  description: string;
  kind: PlatformSettingKind;
  /** The env variable this setting overrides, when there is one. */
  envKey: keyof Env | null;
  /** Inclusive limits: seconds for a duration, a number for a count, the
   * length for text, the number of addresses for an email list. */
  min?: number;
  max?: number;
  unit?: DurationUnit;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const PLATFORM_SETTING_DEFINITIONS: readonly PlatformSettingDefinition[] = [
  {
    key: 'opsAlertEmails',
    group: 'operations',
    label: 'Operations alert recipients',
    description: 'Who is emailed when the server raises an operational or security alert.',
    kind: 'emailList',
    envKey: 'OPS_ALERT_EMAILS',
    min: 0,
    max: 10,
  },
  {
    key: 'emailSenderName',
    group: 'operations',
    label: 'Email sender name',
    description: 'The name people see on every email the platform sends.',
    kind: 'text',
    envKey: null,
    min: 1,
    max: 60,
  },
  {
    key: 'emailSenderAddress',
    group: 'operations',
    label: 'Email sender address',
    description:
      'The address every email is sent from. It must stay on the domain your email provider has verified.',
    kind: 'email',
    envKey: 'SMTP_FROM_ADDRESS',
  },
  {
    key: 'defaultSchoolTimezone',
    group: 'operations',
    label: 'Default timezone for new schools',
    description: 'Given to each new school. A School Admin can change their own school later.',
    kind: 'timezone',
    envKey: 'DEFAULT_SCHOOL_TIMEZONE',
  },
  {
    key: 'platformSessionTtlSeconds',
    group: 'sign-in',
    label: 'Software Admin session length',
    description: 'How long a Software Admin stays signed in, however active they are.',
    kind: 'duration',
    envKey: 'PLATFORM_SESSION_TTL_SECONDS',
    min: 1 * HOUR,
    max: 24 * HOUR,
    unit: 'hours',
  },
  {
    key: 'platformSessionIdleTimeoutSeconds',
    group: 'sign-in',
    label: 'Software Admin idle sign-out',
    description: 'A Software Admin is signed out after this long without activity.',
    kind: 'duration',
    envKey: 'PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS',
    min: 5 * MINUTE,
    max: 120 * MINUTE,
    unit: 'minutes',
  },
  {
    key: 'schoolSessionTtlSeconds',
    group: 'sign-in',
    label: 'School user session length',
    description: 'How long staff and students stay signed in before signing in again.',
    kind: 'duration',
    envKey: 'SESSION_TTL_SECONDS',
    min: 1 * DAY,
    max: 30 * DAY,
    unit: 'days',
  },
  {
    key: 'authLockoutMaxAttempts',
    group: 'sign-in',
    label: 'Failed sign-ins before lockout',
    description: 'Wrong passwords allowed for one account within the lockout window.',
    kind: 'count',
    envKey: 'AUTH_LOCKOUT_MAX_ATTEMPTS',
    min: 3,
    max: 20,
  },
  {
    key: 'authLockoutWindowSeconds',
    group: 'sign-in',
    label: 'Lockout window',
    description: 'How long failed sign-ins are counted, and how long a lockout lasts.',
    kind: 'duration',
    envKey: 'AUTH_LOCKOUT_WINDOW_SECONDS',
    min: 5 * MINUTE,
    max: 120 * MINUTE,
    unit: 'minutes',
  },
  {
    key: 'passwordResetTokenTtlSeconds',
    group: 'sign-in',
    label: 'Password reset link lifetime',
    description: 'How long an emailed password reset link works.',
    kind: 'duration',
    envKey: 'PASSWORD_RESET_TOKEN_TTL_SECONDS',
    min: 15 * MINUTE,
    max: 24 * HOUR,
    unit: 'minutes',
  },
];

export const PLATFORM_SETTING_KEYS = PLATFORM_SETTING_DEFINITIONS.map((d) => d.key);

export function isPlatformSettingKey(key: string): key is PlatformSettingKey {
  return (PLATFORM_SETTING_KEYS as string[]).includes(key);
}

export function platformSettingDefinition(key: PlatformSettingKey): PlatformSettingDefinition {
  return PLATFORM_SETTING_DEFINITIONS.find((d) => d.key === key)!;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

/** `ops@x.com, b@y.com` → `['ops@x.com', 'b@y.com']`. */
export function parseEmailList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The env sender may be `Name <addr>` or a bare address. */
export function bareAddress(sender: string): string {
  const match = /<([^>]+)>/u.exec(sender);
  return (match?.[1] ?? sender).trim();
}

/** The display name in `Name <addr>`, or '' for a bare address. */
function senderDisplayName(sender: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*</u.exec(sender);
  return match?.[1]?.trim() ?? '';
}

const domainOf = (address: string) => address.split('@')[1]?.toLowerCase() ?? '';

function envSender(env: PlatformSettingsEnv): string {
  return env.NOTIFICATION_TRANSPORT === 'ses' ? env.SES_FROM_ADDRESS : env.SMTP_FROM_ADDRESS;
}

/** The values the env file gives — what every setting falls back to. */
export function platformSettingDefaults(env: PlatformSettingsEnv): PlatformSettings {
  return {
    opsAlertEmails: parseEmailList(env.OPS_ALERT_EMAILS),
    emailSenderName: senderDisplayName(envSender(env)) || getProductName(env),
    emailSenderAddress: bareAddress(envSender(env)),
    defaultSchoolTimezone: env.DEFAULT_SCHOOL_TIMEZONE,
    platformSessionTtlSeconds: env.PLATFORM_SESSION_TTL_SECONDS,
    platformSessionIdleTimeoutSeconds: env.PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS,
    schoolSessionTtlSeconds: env.SESSION_TTL_SECONDS,
    authLockoutMaxAttempts: env.AUTH_LOCKOUT_MAX_ATTEMPTS,
    authLockoutWindowSeconds: env.AUTH_LOCKOUT_WINDOW_SECONDS,
    passwordResetTokenTtlSeconds: env.PASSWORD_RESET_TOKEN_TTL_SECONDS,
  };
}

function isValidTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export type SettingValidation<K extends PlatformSettingKey = PlatformSettingKey> =
  { ok: true; value: PlatformSettings[K] } | { ok: false; message: string };

/**
 * Checks a proposed value against the setting's limits and returns it in
 * its stored form (trimmed text, de-duplicated lower-case addresses).
 * Used by the API before saving and again when reading a stored value, so
 * a value that a later amendment puts out of range falls back to default.
 */
export function validatePlatformSetting(
  key: PlatformSettingKey,
  value: unknown,
  env: PlatformSettingsEnv,
): SettingValidation {
  const def = platformSettingDefinition(key);
  const fail = (message: string): SettingValidation => ({ ok: false, message });
  switch (def.kind) {
    case 'emailList': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        return fail('Enter a list of email addresses.');
      }
      const list = [...new Set((value as string[]).map((v) => v.trim().toLowerCase()))].filter(
        Boolean,
      );
      const bad = list.find((v) => !EMAIL.test(v));
      if (bad) return fail(`"${bad}" is not an email address.`);
      if (list.length > (def.max ?? Infinity)) return fail(`Enter at most ${def.max} addresses.`);
      return { ok: true, value: list };
    }
    case 'text': {
      if (typeof value !== 'string') return fail('Enter some text.');
      const text = value.trim();
      if (/[<>"\r\n]/u.test(text)) return fail('Use letters, numbers and simple punctuation.');
      if (text.length < (def.min ?? 0) || text.length > (def.max ?? Infinity)) {
        return fail(`Use ${def.min}–${def.max} characters.`);
      }
      return { ok: true, value: text };
    }
    case 'email': {
      if (typeof value !== 'string' || !EMAIL.test(value.trim())) {
        return fail('Enter an email address.');
      }
      const address = value.trim().toLowerCase();
      const verified = domainOf(bareAddress(envSender(env)));
      if (verified && domainOf(address) !== verified) {
        return fail(
          `The address must end in @${verified}, the domain your email provider sends from.`,
        );
      }
      return { ok: true, value: address };
    }
    case 'timezone': {
      if (typeof value !== 'string' || !isValidTimeZone(value.trim())) {
        return fail('Choose a valid timezone, such as Africa/Lagos.');
      }
      return { ok: true, value: value.trim() };
    }
    case 'duration':
    case 'count': {
      if (typeof value !== 'number' || !Number.isInteger(value))
        return fail('Enter a whole number.');
      if (value < (def.min ?? -Infinity) || value > (def.max ?? Infinity)) {
        return fail('That value is outside the allowed range.');
      }
      return { ok: true, value };
    }
  }
}

export interface ResolvedPlatformSettings {
  values: PlatformSettings;
  /** Keys whose value comes from a stored change rather than the env. */
  overridden: PlatformSettingKey[];
  /** Stored values that no longer pass validation and were ignored. */
  ignored: PlatformSettingKey[];
}

/** Applies stored overrides (key → JSON value) on top of the env defaults. */
export function resolvePlatformSettings(
  env: PlatformSettingsEnv,
  stored: Iterable<{ key: string; value: unknown }>,
): ResolvedPlatformSettings {
  const values = platformSettingDefaults(env);
  const overridden: PlatformSettingKey[] = [];
  const ignored: PlatformSettingKey[] = [];
  for (const row of stored) {
    if (!isPlatformSettingKey(row.key)) continue;
    const checked = validatePlatformSetting(row.key, row.value, env);
    if (!checked.ok) {
      ignored.push(row.key);
      continue;
    }
    (values as unknown as Record<string, unknown>)[row.key] = checked.value;
    overridden.push(row.key);
  }
  return { values, overridden, ignored };
}

/** `Name <address>` for the From header. */
export function formatSender(
  settings: Pick<PlatformSettings, 'emailSenderName' | 'emailSenderAddress'>,
): string {
  if (!settings.emailSenderAddress) return '';
  const name = settings.emailSenderName.replace(/["<>\r\n]/gu, '').trim();
  return name ? `"${name}" <${settings.emailSenderAddress}>` : settings.emailSenderAddress;
}
