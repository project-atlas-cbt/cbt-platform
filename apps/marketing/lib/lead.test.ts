import { describe, expect, it, vi } from 'vitest';
import {
  RateLimiter,
  callBackEmail,
  isOwnOrigin,
  leadEmail,
  parseCallBack,
  parseLead,
  readMailSettings,
  sendLead,
  sendMail,
  type Lead,
} from './lead';

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

  it('accepts ZeptoMail', () => {
    expect(
      readMailSettings({
        MARKETING_LEAD_EMAIL_PROVIDER: 'zeptomail',
        MARKETING_LEAD_EMAIL_API_KEY: 'k',
        MARKETING_LEAD_EMAIL_TO: 'info@example.com',
        MARKETING_LEAD_EMAIL_FROM: 'no-reply@example.com',
      })?.provider,
    ).toBe('zeptomail');
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

  it('posts to ZeptoMail with the Send Mail token', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
    const zepto = { ...settings, provider: 'zeptomail' as const, apiKey: 'tok' };
    await expect(sendLead(lead, zepto, 'ExamKeep', fetchImpl)).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.zeptomail.com/v1.1/email');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Zoho-enczapikey tok',
    });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      from: { address: 'site@example.com' },
      to: [{ email_address: { address: 'sales@example.com' } }],
      reply_to: [{ address: 'officer@example.com' }],
    });
    // A token pasted with its prefix, as ZeptoMail's API tab shows it, is not doubled.
    await sendLead(lead, { ...zepto, apiKey: 'Zoho-enczapikey tok' }, 'ExamKeep', fetchImpl);
    expect((fetchImpl.mock.calls[1]![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Zoho-enczapikey tok',
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

describe('isOwnOrigin (P3-12)', () => {
  const site = 'https://examkeep.test';
  it('allows this site and a missing header', () => {
    expect(isOwnOrigin('https://examkeep.test', site)).toBe(true);
    expect(isOwnOrigin(null, site)).toBe(true);
  });
  it('refuses another site, Origin: null and junk without throwing', () => {
    expect(isOwnOrigin('https://evil.test', site)).toBe(false);
    expect(isOwnOrigin('null', site)).toBe(false);
    expect(isOwnOrigin('not a url', site)).toBe(false);
  });
});

describe('call-back form', () => {
  function callBack(overrides: Record<string, string> = {}): FormData {
    const data = new FormData();
    const fields = {
      name: 'Ada',
      phone: '0803 123 4567',
      school: '',
      consent: 'yes',
      website: '',
      ...overrides,
    };
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  }

  it('accepts a name and number, school optional', () => {
    expect(parseCallBack(callBack())).toEqual({
      ok: true,
      lead: { name: 'Ada', phone: '0803 123 4567', school: '', consent: 'yes' },
    });
  });

  it('needs consent and a real number, and catches bots', () => {
    expect(parseCallBack(callBack({ consent: '' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseCallBack(callBack({ phone: 'call me' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseCallBack(callBack({ website: 'x' }))).toEqual({ ok: false, reason: 'spam' });
  });

  it('emails without a reply-to when there is no email address', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const mail = callBackEmail(
      { name: 'Ada', phone: '0803', school: '', consent: 'yes' },
      'ExamKeep',
    );
    expect(mail.subject).toBe('ExamKeep call-back request: Ada');
    await sendMail(
      mail,
      { name: 'Ada' },
      { provider: 'zeptomail', apiKey: 'k', to: 'team@example.com', from: 'site@example.com' },
      fetchImpl,
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string) as Record<string, unknown>;
    expect(body.reply_to).toBeUndefined();
    expect(body.textbody).toContain('Phone / WhatsApp: 0803');
  });
});
