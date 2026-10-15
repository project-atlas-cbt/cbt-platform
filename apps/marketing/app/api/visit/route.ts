import { NextResponse, type NextRequest } from 'next/server';
import { RateLimiter, isOwnOrigin } from '@/lib/lead';
import { site } from '@/lib/site';
import {
  classifySource,
  clientIp,
  deviceOf,
  isBot,
  normalisePath,
  pageViews,
  readIngestSettings,
  visitorKeys,
} from '@/lib/visits';

const limiter = new RateLimiter(120, 10 * 60 * 1000);
const done = () => new NextResponse(null, { status: 204 });

/**
 * The page-view beacon (components/visit-beacon.tsx). Always answers 204 and
 * never sets a cookie; the view is queued for the platform API in a batch.
 */
export async function POST(request: NextRequest) {
  if (!isOwnOrigin(request.headers.get('origin'), site.url)) return done();
  if (!readIngestSettings()) return done();

  const userAgent = request.headers.get('user-agent') ?? '';
  const ip = clientIp(request.headers);
  if (isBot(userAgent) || !limiter.allow(ip)) return done();

  let body: Record<string, unknown>;
  try {
    // sendBeacon posts text/plain, so read the text and parse it ourselves.
    const text = await request.text();
    if (text.length > 2000) return done();
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return done();
  }

  const path = normalisePath(body.path);
  if (!path) return done();
  const now = new Date();
  pageViews.add({
    occurredAt: now.toISOString(),
    path,
    ...classifySource(body.referrer, body.tag, site.rootDomain),
    device: deviceOf(userAgent),
    visitorKey: visitorKeys.keyFor(ip, userAgent, now),
  });
  return done();
}
