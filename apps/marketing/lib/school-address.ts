const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// docs/operations/domain-plan.md: never a school.
const RESERVED = new Set(['www', 'api', 'admin']);

/**
 * Turns whatever someone types ("ole", "ole.examkeep.com",
 * "https://ole.examkeep.com/login") into the school's subdomain label, or
 * undefined if it can't be one. No lookup is made: whether the school exists
 * is for the platform to answer, so this page reveals nothing about which
 * schools use it.
 */
export function schoolLabel(input: string, rootDomain: string): string | undefined {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0] ?? '';
  value = value.replace(/:\d+$/, '');
  const suffix = `.${rootDomain.toLowerCase()}`;
  if (value.endsWith(suffix)) value = value.slice(0, -suffix.length);
  if (!LABEL.test(value) || RESERVED.has(value)) return undefined;
  return value;
}

export function schoolSignInUrl(label: string, rootDomain: string): string {
  const local = rootDomain === 'localtest.me';
  return local
    ? `http://${label}.${rootDomain}:3000/login`
    : `https://${label}.${rootDomain}/login`;
}
