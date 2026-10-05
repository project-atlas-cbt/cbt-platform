import Link from 'next/link';
import { primaryNav } from '@/lib/nav';
import { ButtonLink, Container } from './ui';
import { Wordmark } from './wordmark';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="rounded-sm">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-[0.9375rem] text-ink-2">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/find-your-school" className="text-[0.9375rem] text-ink-2 hover:text-ink">
            School sign-in
          </Link>
          <ButtonLink href="/request-a-demo">Request a demo</ButtonLink>
        </div>

        {/* No JavaScript needed: a native disclosure for small screens. */}
        <details className="group lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-rule bg-surface px-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
          </summary>
          <nav
            aria-label="Main"
            className="absolute inset-x-0 top-16 border-b border-rule bg-surface shadow-[0_12px_24px_-12px_rgb(20_22_27/0.18)]"
          >
            <Container className="py-4">
              <ul className="divide-y divide-rule text-base">
                {primaryNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="block py-3 text-ink">
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/find-your-school" className="block py-3 text-ink">
                    School sign-in
                  </Link>
                </li>
              </ul>
              <ButtonLink href="/request-a-demo" className="mt-4 w-full">
                Request a demo
              </ButtonLink>
            </Container>
          </nav>
        </details>
      </Container>
    </header>
  );
}
