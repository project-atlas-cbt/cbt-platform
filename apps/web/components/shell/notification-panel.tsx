'use client';

import { Bell, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format/date';
import { useNotifications } from '@/lib/notifications/queries';
import { useMarkAllRead, useMarkRead } from '@/lib/notifications/mutations';

/**
 * `04 §64` ("Shared Notification System") + F2 scope: "Notification surface
 * — operational only, never social." B10 real data — `GET /v1/notifications`,
 * mark-read, mark-all-read — replacing F2's own "not yet available" stub
 * (this component's own prior doc comment). Polling per F2's own roadmap
 * text ("sensible interval, no realtime requirement here") — see
 * `useNotifications`'s own doc comment for the exact cadence.
 */
export function NotificationPanel() {
  const { data, isPending, isError, error, refetch } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const unreadCount = data?.unreadCount ?? 0;
  // Defensive, not just `!isPending && !isError` — this component is now
  // part of every shell's shared chrome (rendered by AppShell on every
  // page), and a page-level test that blanket-mocks `apiClient.GET` for
  // its own unrelated endpoint (e.g. `/me/permissions`) can otherwise hand
  // this query a resolved-but-wrongly-shaped payload with no `items`
  // field. `data?.items` (never a bare `data.items`) keeps that case an
  // empty list instead of a render crash, with no behavior change in real
  // usage, where the typed contract always includes it.
  const items = data?.items ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Bell className="size-4.5" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex size-2 rounded-full bg-danger" aria-hidden />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Mark all read
            </button>
          ) : null}
        </div>

        {isPending ? (
          <div className="space-y-2 px-4 py-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="px-2 py-2">
            <ErrorState error={error} onRetry={() => void refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="Action-oriented notifications will appear here."
            className="border-none px-4 py-8"
          />
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (notification.status === 'UNREAD') markRead.mutate(notification.id);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    notification.status === 'UNREAD' && 'bg-brand-primary-subtle/40',
                  )}
                >
                  <span
                    className={cn(
                      'text-text-primary',
                      notification.status === 'UNREAD' ? 'font-medium' : 'font-normal',
                    )}
                  >
                    {notification.title}
                  </span>
                  <span className="text-xs text-text-muted">{notification.content}</span>
                  <span className="text-xs text-text-muted">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
