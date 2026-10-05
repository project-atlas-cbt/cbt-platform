import { describe, expect, it, vi } from 'vitest';
import { RateLimiter, leadEmail, parseLead, readMailSettings, sendLead, type Lead } from './lead';

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    name: 'Adaeze Okafor',
    role: 'Principal or vice-principal',
    school: 'Kings College',
    state: 'Lagos',
    students: '700 to 1,500',
    interest: 'Both',
    phone: '0803 123 4567',
    email: 'principal@example.com',
    message: '',
    consent: 'yes',
    website: '',
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const lead: Lead = {
  name: 'Adaeze <Okafor>',
  role: 'Exam officer',
  school: 'Kings College',
  state: 'Lagos',
  students: 'Under 300',
  interest: 'A demo',
  phone: '+234 803 123 4567',
  email: 'officer@example.com',
  message: 'Two labs',
  consent: 'yes',
};

describe('parseLead', () => {
  it('accepts a complete request', () => {
    const result = parseLead(form());
    expect(result.ok).toBe(true);
  });

  it('treats a filled honeypot as spam', () => {
    expect(parseLead(form({ website: 'http://spam.example' }))).toEqual({
      ok: false,
      reason: 'spam',
    });
  });

  it.each([
    ['missing consent', { consent: '' }],
    ['unknown role', { role: 'Hacker' }],
    ['bad email', { email: 'not-an-email' }],
    ['letters in phone', { phone: 'call me maybe' }],
    ['empty school', { school: '   ' }],
  ])('rejects %s', (_label, overrides) => {
    expect(parseLead(form(overrides))).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit inside the window, then refuses', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 10)).toBe(true);
    expect(limiter.allow('a', 20)).toBe(false);
    expect(limiter.allow('b', 20)).toBe(true);
    expect(limiter.allow('a', 1500)).toBe(true);
  });
});

describe('leadEmail', () => {
  it('escapes HTML in every field', () => {
    const mail = leadEmail(lead, 'ExamKeep');
    expect(mail.html).not.toContain('<Okafor>');
    expect(mail.html).toContain('&#60;Okafor&#62;');
    expect(mail.subject).toBe('ExamKeep lead: Kings College (a demo)');
  });
});

describe('readMailSettings', () => {
  it('needs a provider, key, recipient and sender', () => {
    expect(readMailSettings({})).toBeUndefined();
    expect(
      readMailSettings({
        MARKETING_LEAD_EMAIL_PROVIDER: 'resend',
        MARKETING_LEAD_EMAIL_API_KEY: 'k',
      }),
    ).toBeUndefined();
    expect(
      readMailSettings({
        MARKETING_LEAD_EMAIL_PROVIDER: 'brevo',
        MARKETING_LEAD_EMAIL_API_KEY: 'k',
        MARKETING_LEAD_EMAIL_TO: 'sales@example.com',
        MARKETING_LEAD_EMAIL_FROM: 'site@example.com',
      }),
    ).toEqual({
      provider: 'brevo',
      apiKey: 'k',
      to: 'sales@example.com',
      from: 'site@example.com',
    });
  });

  it('never accepts the log provider in production', () => {
    expect(
      readMailSettings({ MARKETING_LEAD_EMAIL_PROVIDER: 'log', NODE_ENV: 'production' }),
    ).toBeUndefined();
    expect(
      readMailSettings({ MARKETING_LEAD_EMAIL_PROVIDER: 'log', NODE_ENV: 'development' }),
    ).toEqual({ provider: 'log' });
  });
});

describe('sendLead', () => {
  const settings = {
    provider: 'resend' as const,
    apiKey: 'key',
    to: 'sales@example.com',
    from: 'site@example.com',
  };

  it('posts to the provider and reports success', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(sendLead(lead, settings, 'ExamKeep', fetchImpl)).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      to: ['sales@example.com'],
      reply_to: 'officer@example.com',
    });
  });

  it('reports failure without logging the lead', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('no', { status: 500 }));
    await expect(sendLead(lead, settings, 'ExamKeep', fetchImpl)).resolves.toBe(false);
    const logged = error.mock.calls.flat().join(' ');
    expect(logged).not.toContain('officer@example.com');
    expect(logged).not.toContain('Kings College');
    error.mockRestore();
  });

  it('reports an unreachable provider as a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      sendLead(lead, { ...settings, provider: 'brevo' }, 'ExamKeep', fetchImpl),
    ).resolves.toBe(false);
  });
});
