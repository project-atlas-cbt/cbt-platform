import { notFound } from 'next/navigation';
import { WorkbenchClient } from './workbench-client';

/**
 * The component workbench (F0 scope: "Storybook or an equivalent component
 * workbench" — see the F0 plan's tooling rationale for why this project
 * uses an in-app route instead of Storybook). Dev-only: never reachable in
 * a production build, so it never appears in `AppShell` navigation or ships
 * as public surface area.
 *
 * NOTE: this route is intentionally `app/workbench/`, not `app/_workbench/`
 * — a leading underscore is Next.js's "private folder" convention and
 * would make the route unreachable entirely, not merely hidden from
 * navigation.
 */
export default function WorkbenchPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <WorkbenchClient />;
}
