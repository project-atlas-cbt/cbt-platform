'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { ROLE_WORKSPACES, usePermissions } from '@/lib/nav';
import { visibleGuides } from '@/lib/help/filter';
import { searchGuides } from '@/lib/help/search';
import { productName } from '@/lib/help/config';
import { HELP_AREA_LABELS, HELP_AREA_ORDER, type Guide, type RoleGuideSet } from '@/lib/help/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpText } from './help-text';
import { SupportContact } from './support-contact';

/**
 * Lists the guides a user can see for their role. While permissions load
 * the list is a skeleton; if they fail, `visibleGuides` shows the whole
 * role set rather than nothing (help is needed most when things fail).
 */
export function useVisibleGuides(set: RoleGuideSet): readonly Guide[] | null {
  const { data, isLoading, isError } = usePermissions();
  return useMemo(() => {
    if (isError) return visibleGuides(set.guides, null);
    if (isLoading || !data) return null;
    return visibleGuides(set.guides, data.permissions);
  }, [set, data, isLoading, isError]);
}

export function helpBasePath(set: RoleGuideSet): string {
  return `${ROLE_WORKSPACES[set.role].root}/help`;
}

function GuideLink({ guide, basePath }: { guide: Guide; basePath: string }) {
  return (
    <li>
      <Link
        href={`${basePath}/${guide.id}`}
        className="block rounded-md px-3 py-2.5 transition-colors hover:bg-surface-muted"
      >
        <span className="block text-sm font-medium text-brand-primary">{guide.title}</span>
        <span className="mt-0.5 block text-sm text-text-secondary">
          <HelpText text={guide.summary} />
        </span>
      </Link>
    </li>
  );
}

/** ADR-0035 — the role's Help screen: search, guides grouped by area, support contact. */
export function HelpCentreScreen({ set }: { set: RoleGuideSet }) {
  const guides = useVisibleGuides(set);
  const [query, setQuery] = useState('');
  const basePath = helpBasePath(set);
  const results = useMemo(
    () => (guides && query.trim() ? searchGuides(guides, query) : null),
    [guides, query],
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-text-primary">Help</h1>
        <p className="text-sm text-text-secondary">
          Step-by-step guides for the work you do in {productName()}.
        </p>
      </header>

      <div role="search">
        <label htmlFor="help-search" className="sr-only">
          Search help
        </label>
        <Input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search, for example “makeup” or “password”"
          autoComplete="off"
          disabled={guides === null}
        />
      </div>

      {guides === null ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading guides">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : results ? (
        <section aria-labelledby="help-results-heading" className="flex flex-col gap-1">
          <h2
            id="help-results-heading"
            className="text-sm font-medium text-text-secondary"
            aria-live="polite"
          >
            {results.length === 0
              ? 'No guides match'
              : `${results.length} guide${results.length === 1 ? '' : 's'} match`}
          </h2>
          {results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No guide matches that search"
              description="Try a different word, such as the name of the screen or button. If you still can't find it, contact support below."
            />
          ) : (
            <ul className="-mx-3 flex flex-col">
              {results.map((guide) => (
                <GuideLink key={guide.id} guide={guide} basePath={basePath} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        HELP_AREA_ORDER.map((area) => {
          const inArea = guides.filter((guide) => guide.area === area);
          if (inArea.length === 0) return null;
          return (
            <section
              key={area}
              aria-labelledby={`help-area-${area}`}
              className="flex flex-col gap-1"
            >
              <h2
                id={`help-area-${area}`}
                className="border-b border-border pb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                {HELP_AREA_LABELS[area]}
              </h2>
              <ul className="-mx-3 flex flex-col">
                {inArea.map((guide) => (
                  <GuideLink key={guide.id} guide={guide} basePath={basePath} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <SupportContact />
    </div>
  );
}
