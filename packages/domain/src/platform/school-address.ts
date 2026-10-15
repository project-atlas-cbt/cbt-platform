/**
 * ADR-0005 amendment (2026-10-15): a new school's web address (the
 * `School.subdomain` label in `<label>.<root>`) is suggested from its name
 * and chosen by the Software Admin, short enough to type every day.
 *
 * Pure rules shared by the API (which enforces them) and the create-school
 * form (which explains them before submit). They apply to NEW addresses
 * only: an existing school keeps the address it was given, whatever its
 * length, because an address is never changed or handed to another school.
 */

export const SCHOOL_ADDRESS_MIN_LENGTH = 3;
export const SCHOOL_ADDRESS_MAX_LENGTH = 20;

/** Lowercase letters and digits, single hyphens between them. No leading,
 * trailing or doubled hyphen, which also rules out punycode (`xn--`). */
const SCHOOL_ADDRESS_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Labels a new school may not take: the platform's own hosts (the set the
 * API refuses to resolve as a school, `RESERVED_SUBDOMAIN_LABELS` in the
 * API) plus names that would confuse users or that the platform may need
 * later. Kept here rather than in that set so adding a word never stops an
 * existing school from resolving.
 */
export const SCHOOL_ADDRESS_RESERVED = new Set([
  // Platform hosts today.
  'api',
  'admin',
  'www',
  'media',
  // Likely platform hosts later.
  'app',
  'apps',
  'auth',
  'login',
  'signin',
  'signup',
  'register',
  'account',
  'accounts',
  'dashboard',
  'portal',
  'console',
  'cdn',
  'static',
  'assets',
  'files',
  'img',
  'images',
  'status',
  'health',
  'metrics',
  'monitor',
  'staging',
  'stage',
  'dev',
  'test',
  'testing',
  'preview',
  'sandbox',
  'demo',
  'beta',
  'internal',
  'ops',
  'root',
  'system',
  'platform',
  // Mail and support.
  'mail',
  'email',
  'smtp',
  'imap',
  'pop',
  'mx',
  'webmail',
  'support',
  'help',
  'docs',
  'blog',
  'news',
  'info',
  'contact',
  'privacy',
  'legal',
  'terms',
  'billing',
  'pay',
  'payments',
  'sales',
  'marketing',
  'security',
  'abuse',
  'noreply',
  'no-reply',
  'postmaster',
  'hostmaster',
  'webmaster',
  // The product's own names (its brand name comes from PRODUCT_NAME; see
  // `schoolAddressProblem`'s productName).
  'atlas',
  'cbt',
  'exam',
  'exams',
  'school',
  'schools',
]);

export type SchoolAddressProblem = 'FORMAT' | 'LENGTH' | 'RESERVED';

/** Trims and lowercases what an admin typed; the stored form. */
export function normaliseSchoolAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The labels a product name would take: `examkeep` and `exam-keep` style. */
function productNameLabels(productName: string): string[] {
  const words = productName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [words.join(''), words.join('-')];
}

/**
 * Why a (normalised) label cannot be a new school's address, or null.
 * `productName` (PRODUCT_NAME) is reserved too, so no school can pose as
 * the platform itself.
 */
export function schoolAddressProblem(
  label: string,
  productName?: string,
): SchoolAddressProblem | null {
  if (label.length < SCHOOL_ADDRESS_MIN_LENGTH || label.length > SCHOOL_ADDRESS_MAX_LENGTH) {
    return 'LENGTH';
  }
  if (!SCHOOL_ADDRESS_PATTERN.test(label)) return 'FORMAT';
  if (SCHOOL_ADDRESS_RESERVED.has(label)) return 'RESERVED';
  if (productName && productNameLabels(productName).includes(label)) return 'RESERVED';
  return null;
}

export const SCHOOL_ADDRESS_PROBLEM_MESSAGES: Record<SchoolAddressProblem | 'TAKEN', string> = {
  LENGTH: `Use ${SCHOOL_ADDRESS_MIN_LENGTH} to ${SCHOOL_ADDRESS_MAX_LENGTH} characters.`,
  FORMAT: 'Use lowercase letters and numbers, with single hyphens between them.',
  RESERVED: 'This address is reserved. Choose another.',
  TAKEN: 'Another school already has this address. Choose another.',
};

/** Words that carry no meaning in an abbreviation. */
const FILLER_WORDS = new Set(['of', 'the', 'and', 'for', 'at', 'in', 'on', 'de']);

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/['’]/g, '') // "St. Mary's" -> "marys", not "mary s"
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function shortenAtHyphen(label: string): string {
  if (label.length <= SCHOOL_ADDRESS_MAX_LENGTH) return label;
  const cut = label.slice(0, SCHOOL_ADDRESS_MAX_LENGTH);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen >= SCHOOL_ADDRESS_MIN_LENGTH ? cut.slice(0, lastHyphen) : cut).replace(
    /-+$/,
    '',
  );
}

/**
 * Short candidate addresses for a school name, best first, each valid by
 * `schoolAddressProblem`. "Our Lady of Apostles Maryway Odo-Ona Ibadan"
 * gives `ola`, `olamooi`, `our-lady`, … The caller removes taken ones.
 */
export function suggestSchoolAddresses(name: string): string[] {
  const words = nameWords(name);
  const significant = words.filter((w) => !FILLER_WORDS.has(w));
  const meaningful = significant.length > 0 ? significant : words;
  const initials = meaningful.map((w) => w[0]).join('');

  const candidates = [
    initials.slice(0, 3),
    initials,
    meaningful[0] ?? '',
    meaningful.slice(0, 2).join('-'),
    shortenAtHyphen(meaningful.join('-')),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (schoolAddressProblem(candidate) === null) out.push(candidate);
  }
  if (out.length === 0) out.push('school-1');
  return out;
}

/**
 * The first suggestion `isTaken` reports free, else the first suggestion
 * with a number (`ola-2`, `ola-3`, …). `isTaken` is caller-supplied so this
 * stays pure; the database's unique index is the final word on a race.
 */
export async function firstFreeSchoolAddress(
  name: string,
  isTaken: (label: string) => Promise<boolean>,
  limit = 1,
): Promise<string[]> {
  const suggestions = suggestSchoolAddresses(name);
  const free: string[] = [];
  for (const candidate of suggestions) {
    if (!(await isTaken(candidate))) free.push(candidate);
    if (free.length >= limit) return free;
  }
  const base = suggestions[0] ?? 'school';
  for (let n = 2; free.length < limit; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SCHOOL_ADDRESS_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (schoolAddressProblem(candidate) === null && !(await isTaken(candidate))) {
      free.push(candidate);
    }
  }
  return free;
}
