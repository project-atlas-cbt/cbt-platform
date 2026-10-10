import type { Role } from '@atlas/domain';

interface Shortcut {
  keys: string;
  action: string;
}

/**
 * The shortcuts that exist today, per role, so the screens themselves need
 * not print them (Haneef, 2026-10-09: no shortcut hint inside the search
 * box). Keep in step with the handlers: `GlobalSearch` (Ctrl/⌘+K) and the
 * question review `DecisionPanel` (A/R/C).
 */
function shortcutsFor(role: Role): Shortcut[] {
  const shortcuts: Shortcut[] = [
    { keys: 'Ctrl + K (⌘ + K on a Mac)', action: 'Open search from any screen' },
  ];
  if (role === 'HOD' || role === 'SCHOOL_ADMIN') {
    shortcuts.push(
      { keys: 'A', action: 'Approve the question you are reviewing' },
      { keys: 'R', action: 'Reject it, with a reason' },
      { keys: 'C', action: 'Request changes from its author' },
    );
  }
  return shortcuts;
}

export function KeyboardShortcuts({ role }: { role: Role }) {
  const shortcuts = shortcutsFor(role);
  return (
    <section aria-labelledby="help-shortcuts" className="flex flex-col gap-2">
      <h2
        id="help-shortcuts"
        className="border-b border-border pb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Keyboard shortcuts
      </h2>
      <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-4 gap-y-2 text-sm">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.keys} className="contents">
            <dt>
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-text-primary">
                {shortcut.keys}
              </kbd>
            </dt>
            <dd className="text-text-secondary">{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
