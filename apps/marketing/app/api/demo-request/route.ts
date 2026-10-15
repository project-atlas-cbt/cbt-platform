import { NextResponse, type NextRequest } from 'next/server';
import { RateLimiter, isOwnOrigin, parseLead, readMailSettings, sendLead } from '@/lib/lead';
import { site } from '@/lib/site';
import { pageViews, readIngestSettings, storeLead, visitorKeyOf } from '@/lib/visits';

const limiter = new RateLimiter(5, 10 * 60 * 1000);

function back(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, site.url || request.url), 303);
}

/**
 * The demo form posts here as a plain HTML form, so it works with no
 * JavaScript at all, and the answer is a redirect to a static page. The
 * request is emailed to the team and saved for the Software Admin's Website
 * screen; either one reaching us counts as sent.
 */
export async function POST(request: NextRequest) {
  // A browser always sends Origin on a form POST; a different one is another site's form.
  if (!isOwnOrigin(request.headers.get('origin'), site.url)) {
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
  const ingest = readIngestSettings();
  if (!settings && !ingest) {
    console.error('[marketing] lead email is not configured (MARKETING_LEAD_EMAIL_*)');
    return back(request, '/request-a-demo/not-sent');
  }
  const { lead } = result;
  // Send this visitor's queued page views first, so the API can attach them.
  if (ingest) await pageViews.flush();
  const [sent, stored] = await Promise.all([
    settings ? sendLead(lead, settings, site.name) : Promise.resolve(false),
    ingest
      ? storeLead(
          {
            kind: 'DEMO_REQUEST',
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            school: lead.school,
            role: lead.role,
            state: lead.state,
            students: lead.students,
            interest: lead.interest,
            message: lead.message,
            visitorKey: visitorKeyOf(request.headers),
          },
          ingest,
        )
      : Promise.resolve(false),
  ]);
  return back(request, sent || stored ? '/request-a-demo/sent' : '/request-a-demo/not-sent');
}
