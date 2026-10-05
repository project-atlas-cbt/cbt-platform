import { NextResponse, type NextRequest } from 'next/server';
import { schoolLabel, schoolSignInUrl } from '@/lib/school-address';
import { site } from '@/lib/site';

export function GET(request: NextRequest) {
  const label = schoolLabel(request.nextUrl.searchParams.get('school') ?? '', site.rootDomain);
  if (!label)
    return NextResponse.redirect(
      new URL('/find-your-school/invalid', site.url || request.url),
      303,
    );
  return NextResponse.redirect(schoolSignInUrl(label, site.rootDomain), 303);
}
