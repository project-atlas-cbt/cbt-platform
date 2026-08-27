/**
 * F3's first screens to render real dates to a human (dashboard's
 * `computedAt`, school/subscription/activation-grant timestamps) — no
 * shared formatter existed before this. Platform-level (Software Admin)
 * screens have no single school timezone to render into (ADR-0027's
 * per-school timezone rendering is a school-side concern, not this
 * workspace's), so this uses the browser's local timezone — appropriate
 * for an internal operator tool, distinct from student/school-facing
 * screens a later phase builds against ADR-0027 directly.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}
