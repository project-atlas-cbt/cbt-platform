import type { ReactNode } from 'react';
import { Container } from './ui';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article>
      <header className="border-b border-rule bg-surface">
        <Container className="max-w-3xl py-14 sm:py-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-4 text-sm text-ink-muted">Last updated {updated}</p>
          {/* Removed once the text has been reviewed (launch checklist: legal review). */}
          <p
            role="note"
            className="mt-6 rounded-md border border-rule bg-surface-muted px-4 py-3 text-sm leading-relaxed text-ink-2"
          >
            Draft pending legal review. Wording may change before launch.
          </p>
        </Container>
      </header>
      <Container className="max-w-3xl py-12 sm:py-16">
        <div className="prose-guide">{children}</div>
      </Container>
    </article>
  );
}
