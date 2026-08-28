import type { ReactNode } from 'react';
import { SettingsDirtyProvider } from '@/lib/forms/settings-dirty-context';
import { SchoolSettingsTabs } from '@/components/school-settings/school-settings-tabs';

/**
 * F5 — replaces the `[...slug]` catch-all's single `'settings'` placeholder
 * with real nested routes, mirroring `SchoolDetailLayout`'s shape (F3).
 * `<SettingsDirtyProvider>` is what lets any one tab's edit form register
 * "I have unsaved changes" without this layout owning every form's state.
 */
export default function SchoolSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <SettingsDirtyProvider>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-text-primary">School Settings</h1>
        <SchoolSettingsTabs />
        <div className="pt-2">{children}</div>
      </div>
    </SettingsDirtyProvider>
  );
}
