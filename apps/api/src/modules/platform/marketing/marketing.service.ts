import { Injectable } from '@nestjs/common';
import { Prisma, prisma } from '@atlas/db';
import { AppHttpException } from '../../../common/app-http-exception.js';
import { AuditService } from '../../operations/audit-event.service.js';
import type {
  MarketingLeadDto,
  MarketingLeadListResponseDto,
  MarketingPageViewDto,
  MarketingSummaryResponseDto,
  RecordMarketingLeadDto,
} from './dto/marketing.dto.js';

export const MARKETING_LEAD_DELETED_ACTION = 'PLATFORM_MARKETING_LEAD_DELETED';

/** The marketing site's audience is Nigerian schools; its days, like the
 * marketing server's daily visitor salt, are Lagos days (UTC+1, no DST). */
export const MARKETING_TIMEZONE = 'Africa/Lagos';
export const DIRECT_SOURCE_LABEL = 'Direct or unknown';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A batched view may arrive a little late; anything implausible is stamped now. */
const MAX_VIEW_AGE_MS = DAY_MS;
const MAX_VIEW_SKEW_MS = 5 * 60 * 1000;
/** How far back a contact's same-day visitor key is matched. */
const LEAD_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
const MAX_PAGES_ON_LEAD = 20;

const lagosDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MARKETING_TIMEZONE }).format(d);

/** The `days` Lagos calendar days ending today, oldest first. */
export function lagosDays(days: number, now = new Date()): string[] {
  const [y, m, d] = lagosDate(now).split('-').map(Number) as [number, number, number];
  const today = Date.UTC(y, m - 1, d);
  return Array.from({ length: days }, (_, i) =>
    new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
}

/** Midnight in Lagos at the start of `day` (YYYY-MM-DD), as an instant. */
const lagosMidnight = (day: string) => new Date(`${day}T00:00:00+01:00`);

/**
 * ADR-0034 amendment (2026-10-15): marketing site page views and the
 * contacts people choose to leave there. Platform-scoped; written by the
 * marketing site's server, read by Software Admin.
 */
@Injectable()
export class MarketingService {
  constructor(private readonly audit: AuditService) {}

  async recordPageViews(views: MarketingPageViewDto[], now = new Date()): Promise<number> {
    const result = await prisma.marketingPageView.createMany({
      data: views.map((v) => {
        const at = new Date(v.occurredAt);
        const plausible =
          !Number.isNaN(at.getTime()) &&
          at.getTime() <= now.getTime() + MAX_VIEW_SKEW_MS &&
          at.getTime() >= now.getTime() - MAX_VIEW_AGE_MS;
        return {
          occurredAt: plausible ? at : now,
          path: v.path,
          source: v.source ?? null,
          referrerHost: v.referrerHost ?? null,
          device: v.device,
          visitorKey: v.visitorKey,
        };
      }),
    });
    return result.count;
  }

  async recordLead(input: RecordMarketingLeadDto, now = new Date()): Promise<{ id: string }> {
    let pagesViewed: string[] = [];
    let source: string | null = null;
    if (input.visitorKey) {
      const views = await prisma.marketingPageView.findMany({
        where: {
          visitorKey: input.visitorKey,
          occurredAt: { gte: new Date(now.getTime() - LEAD_MATCH_WINDOW_MS) },
        },
        orderBy: { occurredAt: 'asc' },
        select: { path: true, source: true },
        take: 500,
      });
      pagesViewed = [...new Set(views.map((v) => v.path))].slice(0, MAX_PAGES_ON_LEAD);
      source = views.find((v) => v.source)?.source ?? null;
    }
    const optional = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    const lead = await prisma.marketingLead.create({
      data: {
        kind: input.kind,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: optional(input.email),
        school: optional(input.school),
        role: optional(input.role),
        state: optional(input.state),
        students: optional(input.students),
        interest: optional(input.interest),
        message: optional(input.message),
        pagesViewed,
        source,
      },
      select: { id: true },
    });
    return lead;
  }

  async summary(days: number, now = new Date()): Promise<MarketingSummaryResponseDto> {
    const dayList = lagosDays(days, now);
    const since = lagosMidnight(dayList[0]!);

    const [daily, pages, sources, devices, leads] = await Promise.all([
      prisma.$queryRaw<{ day: string; visits: number; visitors: number }[]>(Prisma.sql`
        SELECT to_char((occurred_at AT TIME ZONE ${MARKETING_TIMEZONE})::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS visits,
               count(DISTINCT visitor_key)::int AS visitors
          FROM marketing_page_views
         WHERE occurred_at >= ${since}
         GROUP BY 1`),
      prisma.$queryRaw<{ label: string; count: number }[]>(Prisma.sql`
        SELECT path AS label, count(*)::int AS count
          FROM marketing_page_views
         WHERE occurred_at >= ${since}
         GROUP BY path
         ORDER BY count DESC, path
         LIMIT 10`),
      // A visitor's source is the first one their day's visit carried (only
      // the landing page has a referrer or link tag), counted once per visitor.
      prisma.$queryRaw<{ label: string; count: number }[]>(Prisma.sql`
        SELECT coalesce(source, ${DIRECT_SOURCE_LABEL}) AS label, count(*)::int AS count
          FROM (SELECT (array_agg(source ORDER BY occurred_at) FILTER (WHERE source IS NOT NULL))[1] AS source
                  FROM marketing_page_views
                 WHERE occurred_at >= ${since}
                 GROUP BY visitor_key) AS visitors
         GROUP BY 1
         ORDER BY count DESC, label
         LIMIT 10`),
      prisma.marketingPageView.groupBy({
        by: ['device'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.marketingLead.count({ where: { createdAt: { gte: since } } }),
    ]);

    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = dayList.map((date) => ({
      date,
      visits: byDay.get(date)?.visits ?? 0,
      visitors: byDay.get(date)?.visitors ?? 0,
    }));
    const visits = series.reduce((n, d) => n + d.visits, 0);
    const mobile = devices.find((d) => d.device === 'mobile')?._count._all ?? 0;

    return {
      days,
      visits,
      visitors: series.reduce((n, d) => n + d.visitors, 0),
      leads,
      mobilePercent: visits === 0 ? 0 : Math.round((mobile / visits) * 100),
      daily: series,
      topPages: pages,
      topSources: sources,
    };
  }

  async listLeads(page: number, pageSize: number): Promise<MarketingLeadListResponseDto> {
    const [rows, total] = await Promise.all([
      prisma.marketingLead.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.marketingLead.count(),
    ]);
    const leads: MarketingLeadDto[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      kind: r.kind,
      name: r.name,
      phone: r.phone,
      email: r.email,
      school: r.school,
      role: r.role,
      state: r.state,
      students: r.students,
      interest: r.interest,
      message: r.message,
      pagesViewed: r.pagesViewed,
      source: r.source,
    }));
    return { leads, total, page, pageSize };
  }

  /** Deletes a contact (a person asked to be removed, or it is spam).
   * The audit event carries no personal data — only what kind it was. */
  async deleteLead(actorUserId: string, id: string): Promise<void> {
    const lead = await prisma.marketingLead.findUnique({
      where: { id },
      select: { id: true, kind: true, createdAt: true },
    });
    if (!lead) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Contact not found.' });
    }
    await prisma.marketingLead.delete({ where: { id } });
    await this.audit.recordPlatform({
      actorUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: MARKETING_LEAD_DELETED_ACTION,
      entityType: 'MarketingLead',
      entityId: id,
      metadata: { kind: lead.kind, createdAt: lead.createdAt.toISOString() },
    });
  }
}
