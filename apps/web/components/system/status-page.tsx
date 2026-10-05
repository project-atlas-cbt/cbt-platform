import type { ReactNode } from 'react';

export interface StatusPageProps {
  /** Short code shown above the heading, e.g. "404". */
  code: string;
  title: string;
  children: ReactNode;
  /** The one next step the visitor can take. */
  action?: ReactNode;
}

/**
 * F21 (DoD 4): the shared frame for the app's own error pages (404,
 * unsupported browser). Server-rendered markup only, so it reads the same
 * on a browser that cannot run the app bundle. The maintenance page is
 * static HTML served by Caddy (`infra/vps/maintenance`), because it must
 * show while this app is down.
 */
export function StatusPage({ code, title, children, action }: StatusPageProps) {
  return (
    <main className="flex min-h-[70vh] items-start justify-center px-6 pt-[12vh]">
      <section
        aria-labelledby="status-page-title"
        className="w-full max-w-lg rounded-md border border-border bg-surface px-8 py-7"
      >
        <p className="text-xs font-medium tracking-wide text-text-muted uppercase tabular-nums">
          {code}
        </p>
        <h1 id="status-page-title" className="mt-1 text-xl font-semibold text-text-primary">
          {title}
        </h1>
        <div className="mt-3 space-y-3 text-sm text-text-secondary">{children}</div>
        {action ? <div className="mt-6">{action}</div> : null}
      </section>
    </main>
  );
}
