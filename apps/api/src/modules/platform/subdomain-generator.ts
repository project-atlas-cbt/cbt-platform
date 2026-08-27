import { RESERVED_SUBDOMAIN_LABELS } from '../../common/subdomain.js';

// School.subdomain is @db.VarChar(63) — a DNS label's own max length.
// Truncate the slugified base well short of that so a numeric
// disambiguation suffix ("-12") always fits without re-truncating and
// accidentally colliding with a different school's already-truncated base.
const MAX_BASE_LENGTH = 55;

/**
 * ADR-0005: "B3: subdomain allocation and validation at school creation."
 * `05 §3.2`'s "School identifier... must be unique" — this IS that
 * identifier (see School's own schema doc comment: no separate
 * `school_code` column). Pure slugification, no I/O — lowercase, non
 * [a-z0-9] runs collapsed to a single hyphen, leading/trailing hyphens
 * trimmed, truncated. Falls back to "school" if the name has no
 * ASCII-alphanumeric content at all (e.g. a name in a non-Latin script).
 */
export function slugifySchoolName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, ''); // truncation may have left a trailing hyphen

  return slug.length > 0 ? slug : 'school';
}

/**
 * Appends a numeric disambiguator until `isTaken` (a caller-supplied
 * uniqueness check — kept out of this function so it stays pure and
 * unit-testable without a database) reports a free candidate, also
 * refusing to land on a reserved platform label (`api`/`admin`/`www` —
 * see subdomain.ts's RESERVED_SUBDOMAIN_LABELS, the exact set
 * TenancyMiddleware would otherwise silently resolve as "no school").
 */
export async function generateUniqueSchoolSubdomain(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifySchoolName(name);
  let candidate = base;
  let suffix = 1;

  while (RESERVED_SUBDOMAIN_LABELS.has(candidate) || (await isTaken(candidate))) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}
