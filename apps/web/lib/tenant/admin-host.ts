/**
 * The platform host (`admin.<root>`) serves only the Software Admin console,
 * whose routes all live under `/admin`. Its bare root and `/login` would
 * otherwise render the school entry route and the school sign-in form,
 * which can never succeed there, so the proxy sends them to the console:
 * `/admin` (whose guard sends a signed-out visitor on to `/admin/login`)
 * and `/admin/login`. Returns null for every other host or path.
 */
export function adminHostRedirect(hostname: string, pathname: string): string | null {
  if (!hostname.toLowerCase().startsWith('admin.')) return null;
  if (pathname === '/') return '/admin';
  if (pathname === '/login') return '/admin/login';
  return null;
}
