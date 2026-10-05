import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusPage } from '@/components/system/status-page';

/**
 * F21 (DoD 4): any URL no route matches, and any `notFound()` call. Says
 * plainly what happened and offers the start page, which sends each
 * visitor to sign-in or their own workspace (app/page.tsx).
 */
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="This page doesn't exist"
      action={
        <Button asChild>
          <Link href="/">Go to the start page</Link>
        </Button>
      }
    >
      <p>The address may be mistyped, or the page may have moved.</p>
      <p>
        If you followed a link from an email, it may be for a different school&apos;s address. Check
        that the link starts with your school&apos;s own address.
      </p>
    </StatusPage>
  );
}
