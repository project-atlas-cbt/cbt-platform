import type { ReactNode } from 'react';
import { derivePalette, type DerivedPalette } from './derive-palette';
import { BRAND_TOKEN_VARS, NEUTRAL_TOKEN_VARS } from './tokens';

/**
 * The platform default is used wherever no school colour is known yet
 * (the platform-admin surface, F0's workbench, or a transient pre-branding
 * moment) — not a hard-coded fallback sprinkled through components, but
 * the one place a default lives. `app/globals.css`'s `:root` values are
 * this exact colour's derived output, generated once so there is no SSR
 * flash before <ThemeProvider> runs; regenerate both together if this
 * ever changes.
 */
export const PLATFORM_DEFAULT_PRIMARY_COLOR = '#1D4ED8';

/** Builds the `:root { --token: value; ... }` CSS text for one derived palette. */
export function buildThemeCss(palette: DerivedPalette): string {
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
    [NEUTRAL_TOKEN_VARS.borderStrong, palette.neutral.borderStrong],
    [NEUTRAL_TOKEN_VARS.textPrimary, palette.neutral.textPrimary],
    [NEUTRAL_TOKEN_VARS.textSecondary, palette.neutral.textSecondary],
    [NEUTRAL_TOKEN_VARS.textMuted, palette.neutral.textMuted],
    [NEUTRAL_TOKEN_VARS.textOnBrand, palette.neutral.textOnBrand],
    [NEUTRAL_TOKEN_VARS.focusRing, palette.neutral.focusRing],
  ] as const;

  return `:root{${declarations.map(([name, value]) => `${name}:${value}`).join(';')}}`;
}

export interface ThemeProviderProps {
  /** A school's primary colour (hex). Omit to use the platform default. */
  primaryColor?: string;
  children: ReactNode;
}

/**
 * Overrides the brand/neutral design tokens for everything it wraps, by
 * writing a `<style>` tag rather than inline `style` props — this keeps
 * every token available to every descendant via plain CSS custom-property
 * inheritance (and to Tailwind's `@theme`-mapped utility classes) without
 * threading a theme object through props. Server-renderable: the palette
 * is derived synchronously from a hex string, so there is no
 * flash-of-default-branding on first paint (doctrine's "before
 * authentication" requirement for the login screen, F1).
 */
export function ThemeProvider({ primaryColor, children }: ThemeProviderProps) {
  const palette = derivePalette(primaryColor ?? PLATFORM_DEFAULT_PRIMARY_COLOR);

  return (
    <>
      {/* Static CSS built from our own derived hex values, never from
          unsanitised user input — safe to inject directly. */}
      <style id="atlas-theme-tokens" dangerouslySetInnerHTML={{ __html: buildThemeCss(palette) }} />
      {children}
    </>
  );
}

export type { DerivedPalette };
