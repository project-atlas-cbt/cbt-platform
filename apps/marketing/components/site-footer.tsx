import Link from 'next/link';
import { footerNav } from '@/lib/nav';
import { site, telHref, whatsappLink } from '@/lib/site';
import { Container } from './ui';
import { Wordmark } from './wordmark';

export function SiteFooter() {
  const whatsapp = whatsappLink(site);
  return (
    <footer className="border-t border-rule bg-surface">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
            Computer-based testing for secondary schools, built for Nigerian labs, power and
            connections.
          </p>
          {site.email || site.phone || whatsapp || site.address ? (
            <ul className="mt-5 space-y-1.5 text-sm text-ink-2">
              {site.email ? (
                <li>
                  <a href={`mailto:${site.email}`} className="hover:text-ink">
                    {site.email}
                  </a>
                </li>
              ) : null}
              {site.phone ? (
                <li>
                  <a href={telHref(site.phone)} className="hover:text-ink">
                    {site.phone}
                  </a>
                </li>
              ) : null}
              {whatsapp ? (
                <li>
                  <a href={whatsapp} className="hover:text-ink" rel="noopener">
                    Chat on WhatsApp
                  </a>
                </li>
              ) : null}
              {site.address ? <li className="pt-2 text-ink-muted">{site.address}</li> : null}
            </ul>
          ) : null}
        </div>
        {footerNav.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="text-sm font-semibold text-ink">{group.heading}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container>
        <p className="border-t border-rule py-6 text-sm text-ink-muted">
          © {new Date().getFullYear()} {site.company ?? site.name}. All rights reserved.
          {site.company ? ` ${site.name} is a product of ${site.company}.` : null}
        </p>
      </Container>
    </footer>
  );
}
