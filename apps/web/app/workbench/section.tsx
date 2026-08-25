import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-border pb-10">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="size-8 rounded-md border border-border"
        style={{ backgroundColor: hex }}
        aria-hidden
      />
      <div>
        <p className="font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{hex}</p>
      </div>
    </div>
  );
}
