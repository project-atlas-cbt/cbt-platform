/**
 * B20 log hygiene (DoD 6: "logs contain no credentials, answer content, or
 * unnecessary PII"). Two layers:
 *
 * 1. `REDACT_PATHS` — pino's structural redaction for any object logged
 *    with a known-sensitive key, wherever it nests.
 * 2. `scrubText` — free-text scrubbing for messages and error strings,
 *    which pino's path redaction can't see into (a Prisma error message
 *    can quote a row's values; a URL can carry a reset token).
 *
 * Identifiers (user/school/attempt ids) are deliberately NOT redacted —
 * they carry no meaning outside the system and are what make a log line
 * traceable to an audit record.
 */
const SENSITIVE_KEYS = [
  // credentials and bearer material
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'rawToken',
  'tokenHash',
  'challengeToken',
  'recoveryCode',
  'recoveryCodes',
  'otp',
  'secret',
  'secretCiphertext',
  'otpauthUri',
  'cookie',
  'authorization',
  'x-csrf-token',
  'set-cookie',
  'resetUrl',
  'activationUrl',
  'activationKey',
  // personal data
  'email',
  'firstName',
  'lastName',
  'displayName',
  'loginIdentifier',
  'identifier',
  'admissionNumber',
  'phone',
  'ipAddress',
  'userAgent',
  'rawData',
  // answer content (ADR-0007) — never in a log line
  'answer',
  'answers',
  'response',
  'selectedOptionIds',
  'textResponse',
];
// Deliberately absent: generic keys like `code`, `name`, `value` — they
// collide with error codes, the logger name, and ordinary config values.
// Request DTOs that carry a secret use the specific names above (`otp`,
// `recoveryCode`, `password`).

// fast-redact path syntax: plain identifiers use dot access, hyphenated
// header names need bracket access.
const seg = (k: string) => (/^[A-Za-z_$][\w$]*$/u.test(k) ? `.${k}` : `["${k}"]`);
const top = (k: string) => (/^[A-Za-z_$][\w$]*$/u.test(k) ? k : `["${k}"]`);

export const REDACT_PATHS: string[] = [
  ...SENSITIVE_KEYS.map(top),
  ...SENSITIVE_KEYS.map((k) => `*${seg(k)}`),
  ...SENSITIVE_KEYS.map((k) => `*.*${seg(k)}`),
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body',
];

export const REDACTED = '[redacted]';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
// token-ish query parameters: ?token=…, &key=…, &code=…
const TOKEN_PARAM_RE = /([?&](?:token|key|code|secret|signature|X-Amz-Signature)=)[^&\s"']+/giu;
const BEARER_RE = /(bearer\s+)[a-z0-9._~+/-]+=*/giu;
const COOKIE_PAIR_RE = /((?:atlas_session|atlas_platform_session|_csrf)=)[^;\s"']+/giu;

/** Masks emails, token-bearing URL parameters, bearer tokens and session
 * cookie values inside arbitrary text. Idempotent. */
export function scrubText(input: string): string {
  return input
    .replace(EMAIL_RE, REDACTED)
    .replace(TOKEN_PARAM_RE, `$1${REDACTED}`)
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(COOKIE_PAIR_RE, `$1${REDACTED}`);
}

/** Deep-copies a value, replacing sensitive keys and scrubbing strings —
 * for payloads that leave the process (Sentry events, alert bodies) where
 * pino's redaction doesn't apply. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_SET.has(k.toLowerCase()) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SET.has(key.toLowerCase());
}
