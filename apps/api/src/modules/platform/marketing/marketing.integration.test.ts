/**
 * ADR-0034 amendment (2026-10-15): marketing site visits and contacts, end
 * to end through the API — the shared-key ingest routes the marketing
 * site's server calls, the Software Admin summary and contact list, and an
 * audited delete that keeps the contact's personal data out of the audit.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, prisma } from '@atlas/db';
import {
  ADMIN_HOST,
  bootSecurityApp,
  call,
  csrfContext,
  nextIp,
  SecurityFixture,
} from '../../../test-support/security-fixture.js';
import { lagosDays } from './marketing.service.js';

const KEY = vi.hoisted(() => {
  const key = 'test-marketing-ingest-key-0123456789abcdef';
  process.env.MARKETING_INGEST_KEY = key;
  return key;
});

let app: NestFastifyApplication;
const fixture = new SecurityFixture();

beforeAll(async () => {
  app = await bootSecurityApp();
});

const clear = async () => {
  await prisma.marketingPageView.deleteMany({});
  await prisma.marketingLead.deleteMany({});
};
beforeEach(clear);
afterEach(clear);

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

/** As the marketing server calls it: internal host, no cookies, key header. */
const ingest = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url,
    headers: { host: 'api:3001', 'x-marketing-key': KEY, ...headers },
    remoteAddress: nextIp(),
    payload: payload as Record<string, unknown>,
  });

const visitor = (n: number) => n.toString(16).padStart(32, 'a');
const view = (path: string, key: string, extra: Record<string, unknown> = {}) => ({
  occurredAt: new Date().toISOString(),
  path,
  device: 'desktop',
  visitorKey: key,
  ...extra,
});

describe('ingest routes (marketing site server only)', () => {
  it('refuses a missing or wrong key', async () => {
    const body = { views: [view('/', visitor(1))] };
    const missing = await app.inject({
      method: 'POST',
      url: '/marketing/page-views',
      headers: { host: 'api:3001' },
      remoteAddress: nextIp(),
      payload: body,
    });
    expect(missing.statusCode).toBe(401);
    const wrong = await ingest('/marketing/page-views', body, { 'x-marketing-key': 'nope' });
    expect(wrong.statusCode).toBe(401);
    expect(await prisma.marketingPageView.count()).toBe(0);
  });

  it('keeps CSRF for any request that carries cookies, even with the key', async () => {
    const res = await ingest(
      '/marketing/page-views',
      { views: [view('/', visitor(1))] },
      { cookie: 'atlas_platform_session=x' },
    );
    expect(res.statusCode).toBe(403);
    expect(await prisma.marketingPageView.count()).toBe(0);
  });

  it('validates the batch: paths, device and visitor key', async () => {
    for (const bad of [
      view('https://evil.example/', visitor(1)),
      view('/', visitor(1), { device: 'tv' }),
      view('/', '192.168.0.1'),
    ]) {
      const res = await ingest('/marketing/page-views', { views: [bad] });
      expect(res.statusCode).toBe(400);
    }
    expect(await prisma.marketingPageView.count()).toBe(0);
  });

  it('stamps an implausible time with the time of arrival', async () => {
    const res = await ingest('/marketing/page-views', {
      views: [view('/', visitor(1), { occurredAt: '2020-01-01T00:00:00.000Z' })],
    });
    expect(res.statusCode).toBe(204);
    const row = await prisma.marketingPageView.findFirstOrThrow();
    expect(Date.now() - row.occurredAt.getTime()).toBeLessThan(60_000);
  });
});

describe('Software Admin Website screen', () => {
  it('summarises visits, visitors, pages, sources and devices', async () => {
    const res = await ingest('/marketing/page-views', {
      views: [
        view('/', visitor(1), { source: 'LinkedIn', referrerHost: 'linkedin.com' }),
        view('/pricing', visitor(1)),
        view('/', visitor(2), { device: 'mobile' }),
        view('/', visitor(3), { device: 'mobile', source: 'WhatsApp' }),
      ],
    });
    expect(res.statusCode).toBe(204);
    await ingest('/marketing/leads', {
      kind: 'CALL_BACK',
      name: 'Ada Obi',
      phone: '0803 000 0000',
    });

    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const summary = await call(app, ctx, 'GET', '/platform/marketing/summary?days=7');
    expect(summary.statusCode).toBe(200);
    const body = summary.json<{
      days: number;
      visits: number;
      visitors: number;
      leads: number;
      mobilePercent: number;
      daily: { date: string; visits: number; visitors: number }[];
      topPages: { label: string; count: number }[];
      topSources: { label: string; count: number }[];
    }>();
    expect(body).toMatchObject({ days: 7, visits: 4, visitors: 3, leads: 1, mobilePercent: 50 });
    expect(body.daily.map((d) => d.date)).toEqual(lagosDays(7));
    expect(body.daily.at(-1)).toMatchObject({ visits: 4, visitors: 3 });
    expect(body.topPages[0]).toEqual({ label: '/', count: 3 });
    // By visitor: visitor 1 came from LinkedIn (their second page carries no source).
    expect(body.topSources).toEqual([
      { label: 'Direct or unknown', count: 1 },
      { label: 'LinkedIn', count: 1 },
      { label: 'WhatsApp', count: 1 },
    ]);

    const range = await call(app, ctx, 'GET', '/platform/marketing/summary?days=5');
    expect(range.statusCode).toBe(400);
  });

  it('lists contacts with the pages that browser viewed the same day', async () => {
    await ingest('/marketing/page-views', {
      views: [
        view('/', visitor(7), { source: 'LinkedIn' }),
        view('/pricing', visitor(7)),
        view('/', visitor(7)),
        view('/faq', visitor(8)),
      ],
    });
    const created = await ingest('/marketing/leads', {
      kind: 'DEMO_REQUEST',
      name: 'Bola Ade',
      phone: '+234 803 000 0000',
      email: 'bola@example.com',
      school: 'Example College',
      role: 'Principal or vice-principal',
      state: 'Oyo',
      students: '300 to 700',
      interest: 'A demo',
      message: '',
      visitorKey: visitor(7),
    });
    expect(created.statusCode).toBe(201);

    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const list = await call(app, ctx, 'GET', '/platform/marketing/leads');
    expect(list.statusCode).toBe(200);
    const { leads, total } = list.json<{ leads: Record<string, unknown>[]; total: number }>();
    expect(total).toBe(1);
    expect(leads[0]).toMatchObject({
      kind: 'DEMO_REQUEST',
      name: 'Bola Ade',
      email: 'bola@example.com',
      school: 'Example College',
      message: null,
      pagesViewed: ['/', '/pricing'],
      source: 'LinkedIn',
    });
  });

  it('deletes a contact with an audit event that holds no personal data', async () => {
    const created = await ingest('/marketing/leads', {
      kind: 'CALL_BACK',
      name: 'Chidi Eze',
      phone: '08030000000',
    });
    const { id } = created.json<{ id: string }>();
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);

    const res = await call(app, ctx, 'DELETE', `/platform/marketing/leads/${id}`);
    expect(res.statusCode).toBe(200);
    expect(await prisma.marketingLead.count()).toBe(0);

    const reader = createPrismaClient(process.env.DATABASE_AUDIT_READER_URL);
    try {
      const event = await reader.auditEvent.findFirstOrThrow({
        where: { schoolId: null, action: 'PLATFORM_MARKETING_LEAD_DELETED', entityId: id },
      });
      expect(event.actorUserId).toBe(admin.userId);
      expect(event.metadata).toMatchObject({ kind: 'CALL_BACK' });
      expect(JSON.stringify(event)).not.toMatch(/Chidi|0803/u);
    } finally {
      await reader.$disconnect();
    }

    const again = await call(app, ctx, 'DELETE', `/platform/marketing/leads/${id}`);
    expect(again.statusCode).toBe(404);
  });

  it('is closed to everyone without a Software Admin session', async () => {
    const ctx = await csrfContext(app, ADMIN_HOST);
    const res = await call(app, ctx, 'GET', '/platform/marketing/leads');
    expect(res.statusCode).toBe(401);
  });
});
