import { NextResponse, type NextRequest } from 'next/server';
import { RateLimiter, parseLead, readMailSettings, sendLead } from '@/lib/lead';
import { site } from '@/lib/site';

const limiter = new RateLimiter(5, 10 * 60 * 1000);

function back(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, site.url || request.url), 303);
}

/**
 * The demo form posts here as a plain HTML form, so it works with no
 * JavaScript at all, and the answer is a redirect to a static page.
 */
export async function POST(request: NextRequest) {
  // A browser always sends Origin on a form POST; a different one is another site's form.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(site.url).host) {
    return new NextResponse(null, { status: 403 });
  }

  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!limiter.allow(client)) return back(request, '/request-a-demo/not-sent');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(request, '/request-a-demo/not-sent');
  }

  const result = parseLead(form);
  // A bot is shown the same success page as a person, so it learns nothing.
  if (!result.ok)
    return back(
      request,
      result.reason === 'spam' ? '/request-a-demo/sent' : '/request-a-demo/not-sent',
    );

  const settings = readMailSettings();
  if (!settings) {
    console.error('[marketing] lead email is not configured (MARKETING_LEAD_EMAIL_*)');
    return back(request, '/request-a-demo/not-sent');
  }
  const sent = await sendLead(result.lead, settings, site.name);
  return back(request, sent ? '/request-a-demo/sent' : '/request-a-demo/not-sent');
}
