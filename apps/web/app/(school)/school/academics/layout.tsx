import type { ReactNode } from 'react';
import { AcademicsTabs } from '@/components/academics/academics-tabs';

/**
 * F6 — replaces the `[...slug]` catch-all's `'academics'` placeholder with
 * real nested routes, mirroring `SchoolDetailLayout`'s (F3) and
 * `SchoolSettingsLayout`'s (F5) shape.
 */
export default function SchoolAcademicsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Academics</h1>
      <AcademicsTabs basePath="/school/academics" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
