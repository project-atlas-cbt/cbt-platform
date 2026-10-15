import { NextResponse, type NextRequest } from 'next/server';
import {
  RateLimiter,
  callBackEmail,
  isOwnOrigin,
  parseCallBack,
  readMailSettings,
  sendMail,
} from '@/lib/lead';
import { site } from '@/lib/site';
import { clientIp, pageViews, readIngestSettings, storeLead, visitorKeyOf } from '@/lib/visits';

const limiter = new RateLimiter(5, 10 * 60 * 1000);

function back(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, site.url || request.url), 303);
}

/**
 * The short "call me back" form (components/call-back-form.tsx): a plain
 * HTML form, like the demo request. Saved for the Software Admin's Website
 * screen and emailed to the team; either one reaching us counts as sent.
 */
export async function POST(request: NextRequest) {
  if (!isOwnOrigin(request.headers.get('origin'), site.url)) {
    return new NextResponse(null, { status: 403 });
  }
  if (!limiter.allow(clientIp(request.headers))) return back(request, '/call-back/not-sent');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(request, '/call-back/not-sent');
  }

  const result = parseCallBack(form);
  if (!result.ok)
    return back(request, result.reason === 'spam' ? '/call-back/sent' : '/call-back/not-sent');

  const settings = readMailSettings();
  const ingest = readIngestSettings();
  if (!settings && !ingest) {
    console.error('[marketing] call-back form has nowhere to go (MARKETING_* not configured)');
    return back(request, '/call-back/not-sent');
  }
  const { lead } = result;
  // Send this visitor's queued page views first, so the API can attach them.
  if (ingest) await pageViews.flush();
  const [sent, stored] = await Promise.all([
    settings
      ? sendMail(callBackEmail(lead, site.name), { name: lead.name }, settings)
      : Promise.resolve(false),
    ingest
      ? storeLead(
          {
            kind: 'CALL_BACK',
            name: lead.name,
            phone: lead.phone,
            school: lead.school,
            visitorKey: visitorKeyOf(request.headers),
          },
          ingest,
        )
      : Promise.resolve(false),
  ]);
  return back(request, sent || stored ? '/call-back/sent' : '/call-back/not-sent');
}
