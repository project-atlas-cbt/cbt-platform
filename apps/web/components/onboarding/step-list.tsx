import type { ReactNode } from 'react';

/**
 * The lightweight "added so far" list every onboarding step renders below
 * its own add-form — a plain list, not the heavier `<DataTable>` (F0), per
 * the plan's own reasoning: onboarding's per-step volumes are small and a
 * single admin session, not an ongoing paginated admin surface.
 */
export function StepList<T>({
  items,
  renderItem,
  keyFor,
  emptyLabel,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyFor: (item: T) => string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((item) => (
        <li
          key={keyFor(item)}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
