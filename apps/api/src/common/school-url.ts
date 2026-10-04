/**
 * Builds a link to a school's own web host, `<subdomain>.<root>`, for a URL
 * sent by email. The tenant comes from the host (ADR-0005), so a link to the
 * bare root (or to `WEB_ORIGIN`, a single fixed origin) lands on a page that
 * cannot tell which school it is for.
 *
 * `PLATFORM_ROOT_DOMAIN` gives the host; `WEB_ORIGIN` only its scheme and
 * port (locally `http://...:3000`, in production `https://` with no port).
 */
export function buildSchoolUrl(
  webOrigin: string,
  rootDomain: string,
  subdomain: string,
  path: string,
): string {
  const origin = new URL(webOrigin);
  const port = origin.port ? `:${origin.port}` : '';
  return `${origin.protocol}//${subdomain}.${rootDomain}${port}${path}`;
}
