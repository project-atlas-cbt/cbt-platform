import type { ReactNode } from 'react';
import { AcademicsTabs } from '@/components/academics/academics-tabs';

/** F6 — same shared components as `/school/academics`, mounted under the
 * Moderator role root (04 §26: Moderator gets identical Full manage rights
 * over academic structure, per the permission table). */
export default function ModeratorAcademicsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Academics</h1>
      <AcademicsTabs basePath="/moderator/academics" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
