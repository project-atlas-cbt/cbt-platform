import type { ReactNode } from 'react';
import { AcademicsTabs } from '@/components/academics/academics-tabs';

/** F6 — same shared components as `/school/academics`, mounted under the
 * HOD role root. HOD's `schoolConfig.*.manage` grants are all `denied()`
 * (see `packages/domain`'s permission table) — `useHasPermission` inside
 * each shared screen component hides every mutating control automatically,
 * so this route tree needs no HOD-only component variants. */
export default function HodAcademicsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Academics</h1>
      <AcademicsTabs basePath="/hod/academics" />
      <div className="pt-2">{children}</div>
    </div>
  );
}
