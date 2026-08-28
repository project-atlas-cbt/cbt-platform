import type { ReactNode } from 'react';
import { PeopleTabs } from '@/components/people/people-tabs';

/** F7 — replaces the `[...slug]` catch-all's `'people'` placeholder with
 * real nested routes, mirroring `SchoolAcademicsLayout`'s (F6) shape. */
export default function SchoolPeopleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">People</h1>
      <PeopleTabs basePath="/school/people" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
