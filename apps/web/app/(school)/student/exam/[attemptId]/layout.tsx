'use client';

import type { ReactNode } from 'react';
import { RouteGuard } from '@/components/auth/route-guard';

/**
 * F13 — deliberately a sibling of `student/(shell)`, not nested under it,
 * per that layout's own doc comment anticipating exactly this: the exam
 * runtime must render with **no shell chrome** (`04 §55` — a radically
 * focused interface, no sidebar/navigation). Still under `(school)`, so it
 * inherits `TenantProvider` (branding + the CSRF-bootstrap `GET
 * /tenant/resolve` call every mutating request needs) — only `AppShell`'s
 * nav/header chrome is skipped.
 *
 * `AppShell` bundles `RouteGuard` internally (see `app-shell.tsx`'s own doc
 * comment) — since this layout doesn't use `AppShell` at all, `RouteGuard`
 * is applied directly here instead, so this route is exactly as protected
 * as every other authenticated STUDENT screen.
 */
export default function ExamRuntimeLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard mode="requireAuthenticated" requireRole="STUDENT">
      {children}
    </RouteGuard>
  );
}
