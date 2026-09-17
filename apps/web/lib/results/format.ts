/** `StudentResultListItemDto.percentage` is a plain number, not guaranteed
 * to be a whole one (e.g. 7/9 correct → 77.78) — shown with at most one
 * decimal place, trimmed when it's a whole number, matching `04 §60`/`§61`'s
 * mockups ("86%") without silently rounding away real precision. */
export function formatResultPercentage(percentage: number): string {
  return Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(1)}%`;
}
