import Link from 'next/link';
import { primaryNav } from '@/lib/nav';
import { ButtonLink, Container } from './ui';
import { MobileMenu } from './mobile-menu';
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

        <MobileMenu />
      </Container>
    </header>
  );
}
