import { z } from 'zod';

/**
 * "Request a demo" leads. A lead is emailed to the team and stored nowhere
 * else: it never touches the platform's API or database (proposal §7), and
 * it is never logged, since every field is personal data.
 */

export const studentRanges = [
  'Under 300',
  '300 to 700',
  '700 to 1,500',
  'More than 1,500',
] as const;
export const roleOptions = [
  'Proprietor or director',
  'Principal or vice-principal',
  'Exam officer',
  'ICT lead',
  'Teacher or HOD',
  'Other',
] as const;
export const interestOptions = ['A demo', 'A price quote', 'Both'] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const leadSchema = z.object({
  name: text(120),
  role: z.enum(roleOptions),
  school: text(160),
  state: text(60),
  students: z.enum(studentRanges),
  interest: z.enum(interestOptions),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^[+\d][\d\s()-]*$/, 'phone'),
  email: z.email().max(160),
  message: z.string().trim().max(2000).optional().default(''),
  consent: z.literal('yes'),
});

export type Lead = z.infer<typeof leadSchema>;

export type ParseResult = { ok: true; lead: Lead } | { ok: false; reason: 'spam' | 'invalid' };

export function parseLead(form: FormData): ParseResult {
  // Honeypot: a field hidden from people. Anything in it came from a bot.
  const trap = form.get('website');
  if (typeof trap === 'string' && trap.trim() !== '') return { ok: false, reason: 'spam' };

  const raw = Object.fromEntries(
    [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const parsed = leadSchema.safeParse(raw);
  return parsed.success ? { ok: true, lead: parsed.data } : { ok: false, reason: 'invalid' };
}

/** Best-effort limit per client: a lead form has no business seeing bursts. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function leadEmail(
  lead: Lead,
  productName: string,
): { subject: string; text: string; html: string } {
  const rows: [string, string][] = [
    ['Name', lead.name],
    ['Role', lead.role],
    ['School', lead.school],
    ['State', lead.state],
    ['Students', lead.students],
    ['Wants', lead.interest],
    ['Phone / WhatsApp', lead.phone],
    ['Email', lead.email],
    ['Message', lead.message || '(none)'],
  ];
  return {
    subject: `${productName} lead: ${lead.school} (${lead.interest.toLowerCase()})`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<table>${rows
      .map(
        ([k, v]) =>
          `<tr><th align="left" valign="top">${escapeHtml(k)}</th><td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
      )
      .join('')}</table>`,
  };
}

export interface MailSettings {
  provider: 'resend' | 'brevo' | 'zeptomail' | 'log';
  apiKey?: string | undefined;
  to?: string | undefined;
  from?: string | undefined;
}

export function readMailSettings(
  env: Record<string, string | undefined> = process.env,
): MailSettings | undefined {
  const provider = env.MARKETING_LEAD_EMAIL_PROVIDER?.trim();
  if (provider === 'log') {
    // Development only: never accept leads into a log in production.
    return env.NODE_ENV === 'production' ? undefined : { provider };
  }
  if (provider !== 'resend' && provider !== 'brevo' && provider !== 'zeptomail') return undefined;
  const apiKey = env.MARKETING_LEAD_EMAIL_API_KEY?.trim();
  const to = env.MARKETING_LEAD_EMAIL_TO?.trim();
  const from = env.MARKETING_LEAD_EMAIL_FROM?.trim();
  if (!apiKey || !to || !from) return undefined;
  return { provider, apiKey, to, from };
}

/** Sends the lead through the configured provider's HTTP API. Returns false on any failure. */
export async function sendLead(
  lead: Lead,
  settings: MailSettings,
  productName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const mail = leadEmail(lead, productName);
  if (settings.provider === 'log') {
    console.info('[marketing] demo request received (details withheld: personal data)');
    return true;
  }
  const request =
    settings.provider === 'zeptomail'
      ? {
          // The agent's Send Mail token, the same one its SMTP settings use.
          url: 'https://api.zeptomail.com/v1.1/email',
          headers: {
            Accept: 'application/json',
            Authorization: settings.apiKey!.startsWith('Zoho-enczapikey ')
              ? settings.apiKey!
              : `Zoho-enczapikey ${settings.apiKey}`,
          },
          body: {
            from: { address: settings.from },
            to: [{ email_address: { address: settings.to } }],
            reply_to: [{ address: lead.email, name: lead.name }],
            subject: mail.subject,
            textbody: mail.text,
            htmlbody: mail.html,
          },
        }
      : settings.provider === 'resend'
        ? {
            url: 'https://api.resend.com/emails',
            headers: { Authorization: `Bearer ${settings.apiKey}` },
            body: {
              from: settings.from,
              to: [settings.to],
              reply_to: lead.email,
              subject: mail.subject,
              text: mail.text,
              html: mail.html,
            },
          }
        : {
            url: 'https://api.brevo.com/v3/smtp/email',
            headers: { 'api-key': settings.apiKey! },
            body: {
              sender: { email: settings.from },
              to: [{ email: settings.to }],
              replyTo: { email: lead.email, name: lead.name },
              subject: mail.subject,
              textContent: mail.text,
              htmlContent: mail.html,
            },
          };
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      console.error(
        `[marketing] lead email failed: ${settings.provider} returned ${response.status}`,
      );
    return response.ok;
  } catch {
    console.error(`[marketing] lead email failed: ${settings.provider} unreachable`);
    return false;
  }
}
