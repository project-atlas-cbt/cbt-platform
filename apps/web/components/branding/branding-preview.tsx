'use client';

import { useId, type ReactNode } from 'react';
import { useNonce } from '@/lib/security/nonce-context';
import { derivePalette } from '@/lib/theme/derive-palette';
import { PLATFORM_DEFAULT_PRIMARY_COLOR } from '@/lib/theme/theme-provider';
import { BRAND_TOKEN_VARS, NEUTRAL_TOKEN_VARS } from '@/lib/theme/tokens';

/**
 * `03 §5`'s six preview contexts, rendered as small self-contained
 * illustrative mockups — not live app screens, since the Exam interface and
 * Result pages don't exist as built screens yet (B11+/B14+ territory).
 *
 * Deliberately does **not** reuse `<ThemeProvider>` directly: that
 * component writes a global `:root{...}` `<style>` tag, which would
 * override the *whole page's* theme the moment this preview mounts inside
 * step 2, not just the preview area — `:root` is never scoped to a
 * subtree. Instead this derives the same palette and writes its own
 * `<style>` scoped to a unique class, so the preview reflects the
 * (possibly unsaved) colour being edited without touching the real
 * wizard chrome around it.
 */
export function BrandingPreview({
  primaryColor,
  logoUrl,
}: {
  primaryColor: string | undefined;
  logoUrl?: string | null;
}) {
  const scopeId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scopeClass = `onb-preview-${scopeId}`;
  const nonce = useNonce();
  let palette;
  try {
    palette = derivePalette(primaryColor || PLATFORM_DEFAULT_PRIMARY_COLOR);
  } catch {
    palette = derivePalette(PLATFORM_DEFAULT_PRIMARY_COLOR);
  }

  const declarations = [
    [BRAND_TOKEN_VARS.brandPrimary, palette.brand.brandPrimary],
    [BRAND_TOKEN_VARS.brandPrimaryHover, palette.brand.brandPrimaryHover],
    [BRAND_TOKEN_VARS.brandPrimaryActive, palette.brand.brandPrimaryActive],
    [BRAND_TOKEN_VARS.brandPrimarySubtle, palette.brand.brandPrimarySubtle],
    [BRAND_TOKEN_VARS.brandPrimaryForeground, palette.brand.brandPrimaryForeground],
    [NEUTRAL_TOKEN_VARS.background, palette.neutral.background],
    [NEUTRAL_TOKEN_VARS.surface, palette.neutral.surface],
    [NEUTRAL_TOKEN_VARS.surfaceMuted, palette.neutral.surfaceMuted],
    [NEUTRAL_TOKEN_VARS.border, palette.neutral.border],
    [NEUTRAL_TOKEN_VARS.textPrimary, palette.neutral.textPrimary],
    [NEUTRAL_TOKEN_VARS.textSecondary, palette.neutral.textSecondary],
    [NEUTRAL_TOKEN_VARS.textMuted, palette.neutral.textMuted],
  ] as const;
  const css = `.${scopeClass}{${declarations.map(([name, value]) => `${name}:${value}`).join(';')}}`;

  return (
    <div className={scopeClass}>
      <style nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: css }} />
      <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-background p-4">
        <PreviewCard label="Login">
          <div className="space-y-2 rounded-md border border-border bg-surface p-3">
            {logoUrl ? (
              // A plain <img>, not next/image — same reasoning as
              // TenantBrandLine: a per-request signed URL, not a
              // build-time asset next/image's optimization pipeline expects.
              <img src={logoUrl} alt="" className="h-6 w-auto object-contain" />
            ) : (
              <div className="h-2 w-16 rounded-full bg-brand-primary" />
            )}
            <div className="h-2 w-full rounded-full bg-surface-muted" />
            <div className="h-6 w-full rounded-md bg-brand-primary" />
          </div>
        </PreviewCard>
        <PreviewCard label="Dashboard">
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md bg-brand-primary-subtle" />
            ))}
          </div>
        </PreviewCard>
        <PreviewCard label="Exam interface">
          <div className="space-y-2 rounded-md border border-border bg-surface p-2">
            <div className="flex items-center justify-between">
              <div className="h-2 w-20 rounded-full bg-surface-muted" />
              <span className="rounded-sm bg-brand-primary px-1.5 py-0.5 text-[10px] text-brand-primary-foreground">
                12:00
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-muted" />
          </div>
        </PreviewCard>
        <PreviewCard label="Buttons">
          <div className="flex gap-2">
            <span className="rounded-md bg-brand-primary px-2 py-1 text-[10px] text-brand-primary-foreground">
              Primary
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-[10px] text-text-primary">
              Secondary
            </span>
          </div>
        </PreviewCard>
        <PreviewCard label="Tables">
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-brand-primary-subtle" />
            <div className="h-2 w-full rounded-full bg-surface-muted" />
            <div className="h-2 w-full rounded-full bg-surface-muted" />
          </div>
        </PreviewCard>
        <PreviewCard label="Result pages">
          <div className="flex items-center justify-center rounded-md border border-border bg-surface p-3">
            <span className="text-lg font-semibold text-brand-primary">A</span>
          </div>
        </PreviewCard>
      </div>
    </div>
  );
}

function PreviewCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-text-muted">{label}</p>
      {children}
    </div>
  );
}
