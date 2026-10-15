'use client';

import { useMemo, useState } from 'react';
import { Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricTile } from '@/components/platform/metric-tile';
import { formatDateTime } from '@/lib/format/date';
import {
  useDeleteMarketingLead,
  useMarketingLeads,
  useMarketingSummary,
  type MarketingRange,
} from '@/lib/platform/marketing';
import { cn } from '@/lib/utils';

const RANGES: { days: MarketingRange; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

interface Lead {
  id: string;
  createdAt: string;
  kind: 'DEMO_REQUEST' | 'CALL_BACK';
  name: string;
  phone: string;
  email: string | null;
  school: string | null;
  role: string | null;
  state: string | null;
  students: string | null;
  interest: string | null;
  message: string | null;
  pagesViewed: string[];
  source: string | null;
}

interface Count {
  label: string;
  count: number;
}

/** A Nigerian local number (0803…) as wa.me wants it (234803…). */
function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 11 && digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Visitors per day: one series, so no legend — the heading names it. Each
 * bar has a hover/focus label, and the same numbers are in a table below.
 */
function DailyBars({ daily }: { daily: { date: string; visits: number; visitors: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  const labelEvery = daily.length > 31 ? 14 : daily.length > 7 ? 5 : 1;
  return (
    <div>
      <div
        className="flex h-32 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label={`Visitors per day, highest ${max}. The table below lists each day.`}
      >
        {daily.map((d) => (
          <div
            key={d.date}
            className="group relative flex h-full flex-1 items-end"
            title={`${shortDay(d.date)}: ${d.visitors} visitors, ${d.visits} visits`}
          >
            <div
              className={cn(
                'w-full rounded-t-[4px] bg-brand-primary transition-opacity group-hover:opacity-80',
                d.visitors === 0 && 'bg-transparent',
              )}
              style={{ height: `${(d.visitors / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[0.6875rem] text-text-muted" aria-hidden>
        {daily.map((d, i) => (
          <span key={d.date} className="flex-1 overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? shortDay(d.date) : ''}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-text-secondary">Show as a table</summary>
        <table className="mt-2 w-full max-w-sm text-left text-sm">
          <thead>
            <tr className="text-text-secondary">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Visitors</th>
              <th className="py-1 text-right font-medium">Visits</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className="py-1">{shortDay(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.visitors}</td>
                <td className="py-1 text-right tabular-nums">{d.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function CountList({ title, rows, empty }: { title: string; rows: Count[]; empty: string }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{empty}</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border first:border-t-0">
                <td className="max-w-0 truncate py-1.5 pr-3 text-text-primary" title={r.label}>
                  {r.label === '/' ? 'Home page' : r.label}
                </td>
                <td className="py-1.5 text-right tabular-nums text-text-secondary">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** ADR-0034 amendment — Software Admin's view of the marketing site. */
export function WebsiteScreen() {
  const [days, setDays] = useState<MarketingRange>(30);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deleting, setDeleting] = useState<Lead | null>(null);
  const summary = useMarketingSummary(days);
  const leads = useMarketingLeads(page, pageSize);
  const remove = useDeleteMarketingLead();

  const rows: Lead[] = useMemo(() => leads.data?.leads ?? [], [leads.data]);

  const columns: DataTableColumn<Lead>[] = [
    {
      id: 'createdAt',
      header: 'Received',
      cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
    },
    {
      id: 'person',
      header: 'Person',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium text-text-primary">{r.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge status={r.kind === 'DEMO_REQUEST' ? 'info' : 'neutral'}>
              {r.kind === 'DEMO_REQUEST' ? 'Demo request' : 'Call back'}
            </Badge>
            {r.role ? <span className="text-xs text-text-muted">{r.role}</span> : null}
          </div>
          {r.message ? (
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary" title={r.message}>
              {r.message}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: (r) => (
        <div className="space-y-0.5 text-sm">
          <p className="whitespace-nowrap">
            <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">
              {r.phone}
            </a>{' '}
            <a
              href={whatsappHref(r.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-secondary underline underline-offset-2"
            >
              WhatsApp
            </a>
          </p>
          {r.email ? (
            <p>
              <a href={`mailto:${r.email}`} className="[overflow-wrap:anywhere] hover:underline">
                {r.email}
              </a>
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'school',
      header: 'School',
      cell: (r) =>
        r.school ? (
          <div>
            <p className="text-text-primary">{r.school}</p>
            <p className="text-xs text-text-muted">
              {[r.state, r.students ? `${r.students} students` : null, r.interest]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ) : (
          <span className="text-text-muted">Not given</span>
        ),
    },
    {
      id: 'pages',
      header: 'Pages viewed that day',
      cell: (r) =>
        r.pagesViewed.length > 0 ? (
          <div className="max-w-56">
            <p className="text-xs text-text-secondary">
              {r.pagesViewed.map((p) => (p === '/' ? 'Home' : p)).join(', ')}
            </p>
            {r.source ? <p className="text-xs text-text-muted">Came from {r.source}</p> : null}
          </div>
        ) : (
          <span className="text-xs text-text-muted">Not known</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete contact from ${r.name}`}
          onClick={() => setDeleting(r)}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      ),
    },
  ];

  const s = summary.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Website</h1>
          <p className="text-sm text-text-muted">
            How many people visit the marketing site, and the people who asked to be contacted.
          </p>
        </div>
        <div
          role="group"
          aria-label="Period"
          className="flex rounded-md border border-border p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                'min-h-8 rounded px-3 text-sm',
                days === r.days
                  ? 'bg-surface-muted font-medium text-text-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {summary.isError ? (
        <ErrorState
          error={summary.error}
          onRetry={() => void summary.refetch()}
          title="Visit counts unavailable"
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile label="Visitors" value={s?.visitors ?? 0} isLoading={!s} emphasis />
            <MetricTile label="Page views" value={s?.visits ?? 0} isLoading={!s} />
            <MetricTile label="People who got in touch" value={s?.leads ?? 0} isLoading={!s} />
            <MetricTile
              label="Visits from a phone"
              value={`${s?.mobilePercent ?? 0}%`}
              isLoading={!s}
            />
          </div>

          <section className="rounded-md border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-text-secondary">Visitors per day</h2>
            {s ? <DailyBars daily={s.daily} /> : <Skeleton className="h-32 w-full" />}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <CountList
              title="Most viewed pages"
              rows={s?.topPages ?? []}
              empty="No visits in this period yet."
            />
            <CountList
              title="Where visitors came from"
              rows={s?.topSources ?? []}
              empty="No visits in this period yet."
            />
          </div>

          <p className="max-w-3xl text-xs leading-relaxed text-text-muted">
            Visits are counted without cookies, so a person counts once a day and again if they come
            back another day. A visitor who only reads the site stays anonymous: no name or number
            can be seen. WhatsApp and most apps hide where a visit came from, so add{' '}
            <code className="whitespace-nowrap rounded bg-surface-muted px-1">?ref=whatsapp</code>{' '}
            (or any word, such as{' '}
            <code className="whitespace-nowrap rounded bg-surface-muted px-1">?ref=flyer</code>) to
            links you share to see them here.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">People who got in touch</h2>
          <p className="text-sm text-text-muted">
            Demo requests and call-back numbers left on the site, newest first. They agreed to be
            contacted when they sent the form.
          </p>
        </div>
        {leads.isError ? (
          <ErrorState error={leads.error} onRetry={() => void leads.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            isLoading={leads.isPending}
            page={page}
            pageCount={Math.max(1, Math.ceil((leads.data?.total ?? 0) / pageSize))}
            onPageChange={setPage}
            total={leads.data?.total}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            caption="People who got in touch through the marketing site"
            emptyState={
              <EmptyState
                icon={UserRound}
                title="No one has got in touch yet"
                description="Demo requests and call-back numbers sent from the marketing site appear here."
              />
            }
          />
        )}
      </section>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this contact?</DialogTitle>
            <DialogDescription>
              {deleting?.name}’s details are removed for good. Do this when someone asks to be
              removed, or for spam. The deletion is recorded in the audit log without their details.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success('Contact deleted.');
                    setDeleting(null);
                  },
                  onError: () => toast.error('Could not delete the contact. Try again.'),
                });
              }}
            >
              Delete contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
