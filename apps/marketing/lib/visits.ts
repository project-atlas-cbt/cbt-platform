import { createHash, randomBytes } from 'node:crypto';

/**
 * Anonymous visit counting (ADR-0034 amendment, 2026-10-15).
 *
 * No cookie and no browser storage. The server turns a request's IP address
 * and browser into a `visitorKey` with a random salt that lives only in this
 * process's memory and is replaced every Lagos day, then forgets both. The
 * key is enough to count one person once per day, and to show which pages a
 * person looked at earlier the same day if they then send a form; it cannot
 * be turned back into an address or linked to another day. The IP address
 * and browser string never leave this process.
 */

export const MARKETING_TIMEZONE = 'Africa/Lagos';

export interface PageView {
  occurredAt: string;
  path: string;
  source: string | null;
  referrerHost: string | null;
  device: 'mobile' | 'desktop';
  visitorKey: string;
}

export interface IngestSettings {
  /** The platform API, as the server reaches it (e.g. http://api:3001/v1). */
  apiUrl: string;
  key: string;
}

export function readIngestSettings(
  env: Record<string, string | undefined> = process.env,
): IngestSettings | undefined {
  const apiUrl = env.MARKETING_API_URL?.trim().replace(/\/$/, '');
  const key = env.MARKETING_INGEST_KEY?.trim();
  if (!apiUrl || !key) return undefined;
  return { apiUrl, key };
}

export function lagosDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MARKETING_TIMEZONE }).format(now);
}

/** Visitor keys under a salt that changes every day and is never stored. */
export class VisitorKeys {
  private day = '';
  private salt = Buffer.alloc(0);

  keyFor(ip: string, userAgent: string, now = new Date()): string {
    const day = lagosDay(now);
    if (day !== this.day) {
      this.day = day;
      this.salt = randomBytes(32);
    }
    return createHash('sha256')
      .update(this.salt)
      .update(`${ip}\n${userAgent}`)
      .digest('hex')
      .slice(0, 32);
  }
}

const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget|python|httpclient|monitor/iu;

export function isBot(userAgent: string): boolean {
  return userAgent.trim() === '' || BOT.test(userAgent);
}

export function deviceOf(userAgent: string): 'mobile' | 'desktop' {
  return /mobi|android|iphone|ipod|ipad|opera mini/iu.test(userAgent) ? 'mobile' : 'desktop';
}

/** A page path worth counting: no query, no fragment, plain characters only. */
export function normalisePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.split(/[?#]/u)[0]!;
  if (!path.startsWith('/') || path.length > 200 || !/^\/[\w\-./]*$/u.test(path)) return null;
  if (path.startsWith('/api/') || path.startsWith('/_next/')) return null;
  // A form's thank-you or error page is not a page anyone chose to read.
  if (/\/(sent|not-sent)\/?$/u.test(path)) return null;
  return path.length > 1 ? path.replace(/\/+$/u, '') : path;
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/u, 'LinkedIn'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/u, 'Facebook'],
  [/(^|\.)instagram\.com$/u, 'Instagram'],
  [/(^|\.)(twitter|x)\.com$|^t\.co$/u, 'X (Twitter)'],
  [/(^|\.)whatsapp\.(com|net)$|^wa\.me$/u, 'WhatsApp'],
  [/(^|\.)google\.[a-z.]+$/u, 'Google'],
  [/(^|\.)bing\.com$/u, 'Bing'],
  [/(^|\.)youtube\.com$|^youtu\.be$/u, 'YouTube'],
  [/(^|\.)tiktok\.com$/u, 'TikTok'],
];

const TAGS: Record<string, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  fb: 'Facebook',
  instagram: 'Instagram',
  ig: 'Instagram',
  twitter: 'X (Twitter)',
  x: 'X (Twitter)',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  email: 'Email',
  google: 'Google',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  flyer: 'Flyer',
  qr: 'QR code',
};

/**
 * Where a visit came from. A link tag (`?ref=whatsapp` or `utm_source=…`)
 * wins, because WhatsApp and most apps send no referrer at all; then the
 * referring site. Our own pages and school subdomains are not a source.
 */
export function classifySource(
  referrer: unknown,
  tag: unknown,
  rootDomain: string,
): { source: string | null; referrerHost: string | null } {
  let referrerHost: string | null = null;
  if (typeof referrer === 'string' && referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./u, '');
      const own = host === rootDomain || host.endsWith(`.${rootDomain}`) || host === 'localhost';
      if (!own && host.length <= 120) referrerHost = host;
    } catch {
      referrerHost = null;
    }
  }

  if (typeof tag === 'string' && tag.trim()) {
    const clean = tag.trim().toLowerCase().slice(0, 40);
    const known = TAGS[clean];
    if (known) return { source: known, referrerHost };
    if (/^[a-z0-9][a-z0-9 _-]*$/u.test(clean)) {
      return { source: `Tag: ${clean}`.slice(0, 60), referrerHost };
    }
  }

  if (referrerHost) {
    const match = SOURCES.find(([re]) => re.test(referrerHost));
    return { source: match ? match[1] : referrerHost.slice(0, 60), referrerHost };
  }
  return { source: null, referrerHost: null };
}

/**
 * Page views are sent to the API in batches, at most every few seconds, so a
 * busy hour is a handful of requests. A batch that fails is dropped: a lost
 * count is not worth retrying, and nothing here may slow a page down.
 */
export class PageViewQueue {
  private pending: PageView[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly settings: () => IngestSettings | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly delayMs = 5000,
    private readonly maxBatch = 200,
  ) {}

  add(view: PageView): void {
    if (!this.settings()) return;
    this.pending.push(view);
    if (this.pending.length >= this.maxBatch) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.delayMs);
      this.timer.unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const settings = this.settings();
    const views = this.pending.splice(0, this.maxBatch);
    if (!settings || views.length === 0) return;
    try {
      const response = await this.fetchImpl(`${settings.apiUrl}/marketing/page-views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Marketing-Key': settings.key },
        body: JSON.stringify({ views }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) console.error(`[marketing] visit batch refused: ${response.status}`);
    } catch {
      console.error('[marketing] visit batch failed: platform API unreachable');
    }
    if (this.pending.length > 0 && !this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.delayMs);
      this.timer.unref?.();
    }
  }
}

export interface StoredLead {
  kind: 'DEMO_REQUEST' | 'CALL_BACK';
  name: string;
  phone: string;
  email?: string | undefined;
  school?: string | undefined;
  role?: string | undefined;
  state?: string | undefined;
  students?: string | undefined;
  interest?: string | undefined;
  message?: string | undefined;
  visitorKey?: string | undefined;
}

/** Saves a contact to the platform for the Software Admin list. Never logs it. */
export async function storeLead(
  lead: StoredLead,
  settings: IngestSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const body = Object.fromEntries(
    Object.entries(lead).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
  );
  try {
    const response = await fetchImpl(`${settings.apiUrl}/marketing/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Marketing-Key': settings.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      console.error(`[marketing] contact not saved: API returned ${response.status}`);
    return response.ok;
  } catch {
    console.error('[marketing] contact not saved: platform API unreachable');
    return false;
  }
}

/** The client address as Caddy passes it on. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * One salt and one queue per server process. Kept on globalThis because
 * Next may load this module once per route bundle, and the visit route and
 * the form routes must share the day's salt to match a contact's pages.
 */
const shared = globalThis as typeof globalThis & {
  __marketingVisitorKeys?: VisitorKeys;
  __marketingPageViews?: PageViewQueue;
};
export const visitorKeys = (shared.__marketingVisitorKeys ??= new VisitorKeys());
export const pageViews = (shared.__marketingPageViews ??= new PageViewQueue(() =>
  readIngestSettings(),
));

/** The same-day visitor key for a form request, to attach the pages viewed. */
export function visitorKeyOf(headers: Headers): string | undefined {
  const userAgent = headers.get('user-agent') ?? '';
  if (isBot(userAgent)) return undefined;
  return visitorKeys.keyFor(clientIp(headers), userAgent);
}
