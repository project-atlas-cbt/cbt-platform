'use client';

import { ThemeSection } from './sections/theme-section';
import { ButtonsSection } from './sections/buttons-section';
import { FormSection } from './sections/form-section';
import { SelectionSection } from './sections/selection-section';
import { TableSection } from './sections/table-section';
import { OverlaySection } from './sections/overlay-section';
import { StatesSection } from './sections/states-section';
import { ApiSection } from './sections/api-section';

export function WorkbenchClient() {
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-text-primary">
          Project Atlas — Component Workbench
        </h1>
        <p className="text-sm text-text-muted">
          F0&apos;s component workbench (dev-only). Every component in its default, loading, error,
          and empty states, per the F0 Definition of Done.
        </p>
      </header>
      <ThemeSection />
      <ButtonsSection />
      <FormSection />
      <SelectionSection />
      <TableSection />
      <OverlaySection />
      <StatesSection />
      <ApiSection />
    </main>
  );
}
