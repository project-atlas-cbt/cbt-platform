/** `StudentResultListItemDto.percentage` is a plain number, not guaranteed
 * to be a whole one (e.g. 7/9 correct → 77.78) — shown with at most one
 * decimal place, trimmed when it's a whole number, matching `04 §60`/`§61`'s
 * mockups ("86%") without silently rounding away real precision. */
export function formatResultPercentage(percentage: number): string {
  if (Number.isInteger(percentage)) return `${percentage}%`;
  // P2-16: truncated, never rounded up — 89.95% shown as "90.0%" sat next
  // to a B, across the grade boundary the band itself was computed from.
  const truncated = Math.trunc(percentage * 10 + 1e-9) / 10;
  return `${truncated.toFixed(1)}%`;
}
