'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileQuestion } from 'lucide-react';
import { ROLE_WORKSPACES } from '@/lib/nav';
import type { RoleGuideSet } from '@/lib/help/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { helpBasePath, useVisibleGuides } from './help-centre-screen';
import { HelpText } from './help-text';
import { SupportContact } from './support-contact';

/** ADR-0035 — one guide: numbered steps, "Good to know", the screen it is about. */
export function GuideScreen({ set, guideId }: { set: RoleGuideSet; guideId: string }) {
  const guides = useVisibleGuides(set);
  const basePath = helpBasePath(set);
  const root = ROLE_WORKSPACES[set.role].root;

  const back = (
    <Link
      href={basePath}
      className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All help
    </Link>
  );

  if (guides === null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        {back}
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const guide = guides.find((g) => g.id === guideId);
  if (!guide) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {back}
        <EmptyState
          icon={FileQuestion}
          title="This guide isn't available"
          description="It may have moved, or it covers something your account cannot do. Search all help instead."
          action={
            <Button asChild variant="secondary">
              <Link href={basePath}>All help</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const related = (guide.related ?? [])
    .map((id) => guides.find((g) => g.id === id))
    .filter((g) => g !== undefined);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        {back}
        <h1 className="text-lg font-semibold text-text-primary">{guide.title}</h1>
        <p className="text-sm text-text-secondary">
          <HelpText text={guide.summary} />
        </p>
      </div>

      <section aria-labelledby="guide-steps-heading" className="flex flex-col gap-2">
        <h2 id="guide-steps-heading" className="sr-only">
          Steps
        </h2>
        <ol className="flex flex-col gap-3">
          {guide.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed text-text-primary">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs font-semibold text-text-secondary tabular-nums"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">
                <HelpText text={step} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      {guide.notes && guide.notes.length > 0 ? (
        <section
          aria-labelledby="guide-notes-heading"
          className="flex flex-col gap-2 border-l-2 border-border-strong pl-4"
        >
          <h2 id="guide-notes-heading" className="text-sm font-semibold text-text-primary">
            Good to know
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-text-secondary">
            {guide.notes.map((note, index) => (
              <li key={index}>
                <HelpText text={note} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {guide.screen ? (
        <div>
          <Button asChild variant="secondary">
            <Link href={guide.screen.href ? `${root}/${guide.screen.href}` : root}>
              Open {guide.screen.label}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      {related.length > 0 ? (
        <section aria-labelledby="guide-related-heading" className="flex flex-col gap-1.5">
          <h2 id="guide-related-heading" className="text-sm font-semibold text-text-primary">
            Related guides
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {related.map((g) => (
              <li key={g.id}>
                <Link
                  href={`${basePath}/${g.id}`}
                  className="font-medium text-brand-primary underline-offset-2 hover:underline"
                >
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SupportContact />
    </article>
  );
}
