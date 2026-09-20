'use client';

import { useRouter } from 'next/navigation';
import type { Role } from '@atlas/domain';
import {
  GraduationCap,
  Users,
  ShieldCheck,
  Building,
  ClipboardList,
  BookOpen,
  BarChart3,
  School,
  ArrowRight,
} from 'lucide-react';
import type {
  SearchCorpus,
  SearchItem,
  SearchResponse,
  PlatformSearchResponse,
} from '@/lib/reports/types';

export interface SearchResultsProps {
  query: string;
  role: Role;
  corpus?: SearchCorpus | undefined;
  results?: SearchResponse | PlatformSearchResponse | undefined;
  isLoading: boolean;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
}

interface FlattenedResultItem {
  corpus: string;
  item: SearchItem;
  href: string;
}

export function resolveResultHref(role: Role, corpus: string, item: SearchItem): string {
  if (role === 'SOFTWARE_ADMIN') {
    if (corpus === 'schools') return `/admin/schools/${item.id}`;
    return `/admin`;
  }

  const rolePrefix =
    role === 'SCHOOL_ADMIN'
      ? '/school'
      : role === 'MODERATOR'
        ? '/moderator'
        : role === 'HOD'
          ? '/hod'
          : '/teacher';

  switch (corpus) {
    case 'students':
      if (role === 'SCHOOL_ADMIN' || role === 'MODERATOR') {
        return `${rolePrefix}/people/students/${item.id}`;
      }
      if (role === 'TEACHER') {
        return `/teacher/my-classes`;
      }
      return `${rolePrefix}/results`;

    case 'teachers':
      return `${rolePrefix}/people/teachers/${item.id}`;

    case 'hods':
      return `${rolePrefix}/people/hods/${item.id}`;

    case 'classes':
      return `${rolePrefix}/academics/classes`;

    case 'exams':
      return `${rolePrefix}/exams/${item.id}`;

    case 'questions':
      return `${rolePrefix}/question-bank/${item.id}`;

    case 'results':
      return `${rolePrefix}/results`;

    default:
      return rolePrefix;
  }
}

const CORPUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  students: { label: 'Students', icon: GraduationCap },
  teachers: { label: 'Teachers', icon: Users },
  hods: { label: 'HODs', icon: ShieldCheck },
  classes: { label: 'Classes', icon: Building },
  exams: { label: 'Exams', icon: ClipboardList },
  questions: { label: 'Questions', icon: BookOpen },
  results: { label: 'Results', icon: BarChart3 },
  schools: { label: 'Schools', icon: School },
};

export function SearchResults({
  query,
  role,
  corpus,
  results,
  isLoading,
  selectedIndex,
  onSelectIndex,
  onClose,
}: SearchResultsProps) {
  const router = useRouter();

  if (query.trim().length < 2) {
    return (
      <div className="p-8 text-center text-sm text-text-muted">
        <p>Type at least 2 characters to search across permitted academic records.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
        <div className="h-10 w-full animate-pulse rounded-md bg-surface-muted" />
        <div className="h-10 w-full animate-pulse rounded-md bg-surface-muted" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface-muted mt-4" />
        <div className="h-10 w-full animate-pulse rounded-md bg-surface-muted" />
      </div>
    );
  }

  if (!results) {
    return null;
  }

  // Flatten items into an indexed list for keyboard navigation
  const flattened: FlattenedResultItem[] = [];

  if ('schools' in results) {
    for (const item of results.schools || []) {
      flattened.push({
        corpus: 'schools',
        item,
        href: resolveResultHref(role, 'schools', item),
      });
    }
  } else {
    const corporaKeys = corpus
      ? [corpus]
      : (['students', 'teachers', 'hods', 'classes', 'exams', 'questions', 'results'] as const);

    for (const c of corporaKeys) {
      const items = results[c] || [];
      for (const item of items) {
        flattened.push({
          corpus: c,
          item,
          href: resolveResultHref(role, c, item),
        });
      }
    }
  }

  if (flattened.length === 0) {
    return (
      <div className="p-8 text-center text-sm">
        <p className="font-medium text-text-primary">No results found for &ldquo;{query}&rdquo;</p>
        <p className="text-xs text-text-muted mt-1">
          Search is role-scoped to your authorized academic domain. Try adjusting your search term.
        </p>
      </div>
    );
  }

  // Group flattened items by corpus for categorized display
  const groupedByCorpus = new Map<
    string,
    { item: SearchItem; globalIndex: number; href: string }[]
  >();

  flattened.forEach((entry, idx) => {
    if (!groupedByCorpus.has(entry.corpus)) {
      groupedByCorpus.set(entry.corpus, []);
    }
    groupedByCorpus.get(entry.corpus)!.push({
      item: entry.item,
      globalIndex: idx,
      href: entry.href,
    });
  });

  return (
    <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
      {Array.from(groupedByCorpus.entries()).map(([corpusName, entries]) => {
        const config = CORPUS_CONFIG[corpusName] ?? { label: corpusName, icon: Building };
        const IconComponent = config.icon;

        return (
          <div key={corpusName} className="mb-4 last:mb-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <IconComponent className="size-3.5" />
              <span>{config.label}</span>
              <span className="ml-auto text-[10px] font-normal text-text-muted">
                {entries.length}
              </span>
            </div>

            <div className="space-y-0.5 mt-1">
              {entries.map(({ item, globalIndex, href }) => {
                const isSelected = globalIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-brand-primary-subtle text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`}
                    onMouseEnter={() => onSelectIndex(globalIndex)}
                    onClick={() => {
                      onClose();
                      router.push(href);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{item.label}</span>
                      {item.detail && (
                        <span className="truncate text-xs text-text-muted">{item.detail}</span>
                      )}
                    </div>
                    {isSelected && (
                      <ArrowRight className="size-4 shrink-0 text-brand-primary ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
