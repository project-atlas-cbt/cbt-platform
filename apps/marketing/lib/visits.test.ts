import { describe, expect, it, vi } from 'vitest';
import {
  PageViewQueue,
  VisitorKeys,
  classifySource,
  deviceOf,
  isBot,
  lagosDay,
  normalisePath,
  readIngestSettings,
  storeLead,
  type PageView,
} from './visits';

const ROOT = 'examkeep.com';

describe('VisitorKeys', () => {
  it('gives one person one key per Lagos day, and a new one the next day', () => {
    const keys = new VisitorKeys();
    const morning = new Date('2026-10-15T08:00:00Z');
    const evening = new Date('2026-10-15T22:00:00Z'); // 23:00 in Lagos, same day
    const nextDay = new Date('2026-10-15T23:30:00Z'); // 00:30 in Lagos, next day
    const a = keys.keyFor('41.1.2.3', 'Firefox', morning);
    expect(a).toMatch(/^[a-f0-9]{32}$/u);
    expect(keys.keyFor('41.1.2.3', 'Firefox', evening)).toBe(a);
    expect(keys.keyFor('41.1.2.4', 'Firefox', evening)).not.toBe(a);
    expect(keys.keyFor('41.1.2.3', 'Chrome', evening)).not.toBe(a);
    expect(keys.keyFor('41.1.2.3', 'Firefox', nextDay)).not.toBe(a);
    expect(lagosDay(nextDay)).toBe('2026-10-16');
  });

  it('never contains the address', () => {
    const key = new VisitorKeys().keyFor('41.1.2.3', 'Firefox');
    expect(key).not.toContain('41');
  });

  it('uses a different salt in each process (no fixed secret)', () => {
    expect(new VisitorKeys().keyFor('1.1.1.1', 'x')).not.toBe(
      new VisitorKeys().keyFor('1.1.1.1', 'x'),
    );
  });
});

describe('classifySource', () => {
  it('names well-known referrers', () => {
    expect(classifySource('https://www.linkedin.com/feed/', undefined, ROOT)).toEqual({
      source: 'LinkedIn',
      referrerHost: 'linkedin.com',
    });
    expect(classifySource('https://lnkd.in/abc', undefined, ROOT).source).toBe('LinkedIn');
    expect(classifySource('https://l.facebook.com/', undefined, ROOT).source).toBe('Facebook');
    expect(classifySource('https://www.google.com.ng/', undefined, ROOT).source).toBe('Google');
    expect(classifySource('https://blog.example.org/post', undefined, ROOT).source).toBe(
      'blog.example.org',
    );
  });

  it('prefers a link tag, since WhatsApp sends no referrer', () => {
    expect(classifySource('', 'whatsapp', ROOT)).toEqual({
      source: 'WhatsApp',
      referrerHost: null,
    });
    expect(classifySource('', 'Ibadan-Flyer', ROOT).source).toBe('Tag: ibadan-flyer');
    expect(classifySource('', '<script>', ROOT).source).toBeNull();
  });

  it('ignores our own pages and school subdomains', () => {
    expect(classifySource('https://examkeep.com/pricing', undefined, ROOT)).toEqual({
      source: null,
      referrerHost: null,
    });
    expect(classifySource('https://ola.examkeep.com/login', undefined, ROOT).source).toBeNull();
    expect(classifySource('not a url', undefined, ROOT).source).toBeNull();
  });
});

describe('request helpers', () => {
  it('cleans paths and refuses anything that is not a plain page path', () => {
    expect(normalisePath('/pricing?x=1#top')).toBe('/pricing');
    expect(normalisePath('/guides/cbt-lab-checklist/')).toBe('/guides/cbt-lab-checklist');
    expect(normalisePath('/')).toBe('/');
    expect(normalisePath('https://evil.example/')).toBeNull();
    expect(normalisePath('/<b>')).toBeNull();
    expect(normalisePath('/api/visit')).toBeNull();
    expect(normalisePath('/request-a-demo/sent')).toBeNull();
    expect(normalisePath('/call-back/not-sent')).toBeNull();
    expect(normalisePath(`/${'a'.repeat(250)}`)).toBeNull();
    expect(normalisePath(42)).toBeNull();
  });

  it('tells phones from computers and skips bots', () => {
    expect(deviceOf('Mozilla/5.0 (Linux; Android 13) Mobile Safari')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('desktop');
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('WhatsApp/2.23 A')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe(false);
  });

  it('needs both the API address and the key', () => {
    expect(readIngestSettings({})).toBeUndefined();
    expect(readIngestSettings({ MARKETING_API_URL: 'http://api:3001/v1' })).toBeUndefined();
    expect(
      readIngestSettings({ MARKETING_API_URL: 'http://api:3001/v1/', MARKETING_INGEST_KEY: 'k' }),
    ).toEqual({ apiUrl: 'http://api:3001/v1', key: 'k' });
  });
});

const view = (path: string): PageView => ({
  occurredAt: new Date().toISOString(),
  path,
  source: null,
  referrerHost: null,
  device: 'desktop',
  visitorKey: 'a'.repeat(32),
});

describe('PageViewQueue', () => {
  const settings = { apiUrl: 'http://api:3001/v1', key: 'secret' };

  it('sends views in one batch with the key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const queue = new PageViewQueue(() => settings, fetchImpl, 60_000);
    queue.add(view('/'));
    queue.add(view('/pricing'));
    await queue.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api:3001/v1/marketing/page-views');
    expect(init?.headers).toMatchObject({ 'X-Marketing-Key': 'secret' });
    const sent = JSON.parse(init?.body as string) as { views: PageView[] };
    expect(sent.views.map((v) => v.path)).toEqual(['/', '/pricing']);
  });

  it('does nothing when not configured, and drops a batch the API cannot take', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('down'));
    const off = new PageViewQueue(() => undefined, fetchImpl, 60_000);
    off.add(view('/'));
    await off.flush();
    expect(fetchImpl).not.toHaveBeenCalled();

    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const on = new PageViewQueue(() => settings, fetchImpl, 60_000);
    on.add(view('/'));
    await on.flush();
    await on.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});

describe('storeLead', () => {
  it('posts only the fields given, and never logs them', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
    const log = vi.spyOn(console, 'error');
    const ok = await storeLead(
      { kind: 'CALL_BACK', name: 'Ada', phone: '0803', school: '', visitorKey: 'b'.repeat(32) },
      { apiUrl: 'http://api:3001/v1', key: 'secret' },
      fetchImpl,
    );
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api:3001/v1/marketing/leads');
    expect(JSON.parse(init?.body as string)).toEqual({
      kind: 'CALL_BACK',
      name: 'Ada',
      phone: '0803',
      visitorKey: 'b'.repeat(32),
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
