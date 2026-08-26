'use client';

import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * `04 §64` ("Shared Notification System") + F2 scope: "Notification surface
 * — operational only, never social." `GET /v1/notifications` /
 * `POST /v1/notifications/:id/read` are B10 (Audit & Notifications), which
 * hasn't shipped — see `roadmap-index.md` §1: "B10 Audit & Notifications
 * has no dedicated frontend phase — it surfaces through F2 (notifications)
 * and F3 (platform audit)." Rather than block the whole shell on an
 * unbuilt backend phase, the real chrome (bell, panel, empty state) is
 * built now against no data source — B10 only has to start returning real
 * rows through this same component once it ships, the same "build the pipe
 * now, swap the data source later" pattern as `TenantProvider`'s B4
 * branding-colour gap. An honest "not yet available" empty state, never a
 * fabricated notification (doctrine §12).
 */
export function NotificationPanel() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label="Notifications"
      >
        <Bell className="size-4.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Action-oriented notifications will appear here once Audit & Notifications (B10) ships."
          className="border-none px-4 py-8"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
