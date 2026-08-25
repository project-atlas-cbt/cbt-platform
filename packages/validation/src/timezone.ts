/**
 * ADR-0027: store UTC (timestamptz), render per school. This module is the
 * one place that formats a UTC instant into a school's local wall-clock
 * time — every display path (API responses meant for direct display, the
 * web app's shared component library per F0) must go through it rather than
 * formatting timestamps ad hoc.
 *
 * The API itself never accepts or emits naive local timestamps: it always
 * exchanges ISO-8601 UTC instants and lets the caller (or this helper)
 * render them locally.
 */

/** Throws if `timeZone` is not a valid IANA zone identifier. */
export function assertValidTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
  } catch {
    throw new RangeError(`Invalid IANA timezone identifier: "${timeZone}"`);
  }
}

export interface FormatInZoneOptions {
  timeZone: string;
  locale?: string;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
}

/** Renders a UTC instant in the given IANA timezone. Defaults to a full date + time display. */
export function formatInTimeZone(instant: Date, options: FormatInZoneOptions): string {
  const { timeZone, locale, dateStyle = 'medium', timeStyle = 'short' } = options;
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle, timeStyle }).format(instant);
}

/** The default school timezone (ADR-0027) when a school has not configured one. */
export const DEFAULT_SCHOOL_TIMEZONE = 'Africa/Lagos';
