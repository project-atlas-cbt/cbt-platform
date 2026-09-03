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

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

/**
 * B10 — the notification panel's first consumer needing a relative
 * timestamp ("3 hours ago") rather than an absolute one — every prior
 * screen's timestamps (`formatDateTime`/`formatDate` above) are absolute,
 * operator-facing records where "when exactly" matters more than "how
 * long ago." Falls back to "just now" under a minute, matching this
 * codebase's own plain, unsurprising copy style elsewhere.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) return 'just now';

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (absSeconds >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(Math.round(diffSeconds / 60), 'minute');
}
