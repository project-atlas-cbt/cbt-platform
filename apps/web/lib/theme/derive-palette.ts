/**
 * Moved to `packages/domain/src/branding/derive-palette.ts` in B4 so the
 * API can compute the identical WCAG-AA-guaranteeing palette server-side
 * (`GET /v1/school/branding`, `GET /v1/tenant/resolve`) without a second,
 * independently-drifting implementation. This file is now a thin
 * re-export so every existing call site in this app (`./index.ts`,
 * `theme-provider.tsx`, the workbench theme section) keeps working
 * unchanged.
 */
export {
  derivePalette,
  type BrandTokens,
  type NeutralTokens,
  type PaletteAdjustment,
  type DerivedPalette,
} from '@atlas/domain';
