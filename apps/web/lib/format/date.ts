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
/**
 * P2-24 (ADR-0027): on a school host every time renders in the school's own
 * timezone, whatever the lab or staff PC's clock is set to. `<TenantProvider>`
 * sets it from `tenant/resolve`; the platform host has no school and leaves
 * it unset, so Software Admin screens keep the browser's timezone.
 */
let displayTimeZone: string | undefined;

export function setDisplayTimeZone(timeZone: string | null | undefined): void {
  displayTimeZone = timeZone ?? undefined;
}

export function getDisplayTimeZone(): string | undefined {
  return displayTimeZone;
}

function zoned(): { timeZone?: string } {
  return displayTimeZone ? { timeZone: displayTimeZone } : {};
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...zoned(),
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...zoned() }).format(
    new Date(iso),
  );
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - (instant - (instant % 1000));
}

/**
 * P2-24: a `datetime-local` value ("2026-10-12T14:30") is a wall-clock time
 * with no zone. On a school host it means the school's time, not the PC's,
 * so convert it through the display timezone. Without one it falls back to
 * the browser's own reading, as before.
 */
export function wallTimeToIso(local: string, timeZone = displayTimeZone): string {
  if (!timeZone) return new Date(local).toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return new Date(local).toISOString();
  const [, y, mo, d, h, mi, se] = match;
  const asUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(se ?? 0),
  );
  const first = asUtc - zoneOffsetMs(asUtc, timeZone);
  return new Date(asUtc - zoneOffsetMs(first, timeZone)).toISOString();
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
