/**
 * Rows-per-page choices for paginated lists. Every list API accepts up to
 * 100 (`@Max(100)` or more on its `pageSize`), so none of these is clamped.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * The page size in a list's `?size=` URL parameter, or `fallback` when it is
 * missing or not one of the offered choices.
 */
export function parsePageSize(raw: string | null, fallback: number): number {
  const value = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value) ? value : fallback;
}

/**
 * A list's own URL for `page` and `pageSize`, leaving out whichever is at its
 * default so the plain path stays the canonical first page.
 */
export function pageListHref(
  basePath: string,
  page: number,
  pageSize: number,
  defaultPageSize = 25,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (pageSize !== defaultPageSize) params.set('size', String(pageSize));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
