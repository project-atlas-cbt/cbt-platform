/**
 * Semantic design tokens (doctrine `docs/design/ui-ux-principles.md` §9,
 * `.claude/skills/project-atlas-ui/SKILL.md` §9). Components read these CSS
 * custom properties — never a raw hex value or a school's colour directly.
 *
 * Two families:
 *  - `brand`/`neutral` — derived per school from one primary colour, see
 *    `derive-palette.ts`. Written dynamically by `<ThemeProvider>`.
 *  - `status` — fixed, semantic, and never derived from branding. A
 *    "Rejected" badge must read as danger-red the same way in every school.
 *    Written once in `app/globals.css` as static CSS custom properties.
 */

/** CSS custom property names for the brand/neutral (school-derived) tokens. */
export const BRAND_TOKEN_VARS = {
  brandPrimary: '--brand-primary',
  brandPrimaryHover: '--brand-primary-hover',
  brandPrimaryActive: '--brand-primary-active',
  brandPrimarySubtle: '--brand-primary-subtle',
  brandPrimaryForeground: '--brand-primary-foreground',
} as const;

export const NEUTRAL_TOKEN_VARS = {
  background: '--background',
  surface: '--surface',
  surfaceMuted: '--surface-muted',
  border: '--border',
  borderStrong: '--border-strong',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  textOnBrand: '--text-on-brand',
  focusRing: '--focus-ring',
} as const;

/**
 * Fixed status tokens — success/warning/danger/info, each with a solid
 * base (white foreground text/icon), and a light "subtle" tint paired with
 * a darker on-brand-independent foreground for badges/banners. Every pair
 * below is verified to clear WCAG AA (>=4.5:1) — see `derive-palette.test.ts`'s
 * companion assertions and the calibration performed while choosing these
 * values. Never derived from a school's brand colour (doctrine §9).
 */
export const STATUS_TOKENS = {
  success: '#15803d',
  successSubtle: '#ecfdf5',
  successSubtleForeground: '#14532d',
  successForeground: '#ffffff',

  warning: '#b45309',
  warningSubtle: '#fffbeb',
  warningSubtleForeground: '#78350f',
  warningForeground: '#ffffff',

  danger: '#b91c1c',
  dangerSubtle: '#fef2f2',
  dangerSubtleForeground: '#7f1d1d',
  dangerForeground: '#ffffff',

  info: '#1d4ed8',
  infoSubtle: '#eff6ff',
  infoSubtleForeground: '#1e3a8a',
  infoForeground: '#ffffff',
} as const;
