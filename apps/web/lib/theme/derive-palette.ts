import { clampChroma, converter, formatHex, wcagContrast, type Oklch } from 'culori';

/**
 * The branding derivation engine (doctrine §9 / SKILL.md §8): a school
 * supplies exactly one primary colour, and this function derives everything
 * else. OKLCH is used throughout because it's perceptually uniform — moving
 * lightness or chroma predictably changes contrast without the visible hue
 * drift RGB/HSL interpolation produces.
 *
 * **Accessibility outranks exact colour reproduction.** If the supplied
 * colour can't yield a WCAG AA (>=4.5:1) foreground, this function adjusts
 * lightness first, then chroma as a last resort — never hue — and reports
 * the adjustment so the UI (F5's branding screen) can explain it rather
 * than silently reproducing a different colour than the school entered.
 */

const toOklch = converter('oklch');
const AA_TEXT_CONTRAST = 4.5;
const WHITE = '#ffffff';
/** Near-black rather than pure #000 — matches this file's own text-primary tone. */
const NEAR_BLACK = '#111111';

export interface BrandTokens {
  brandPrimary: string;
  brandPrimaryHover: string;
  brandPrimaryActive: string;
  brandPrimarySubtle: string;
  brandPrimaryForeground: string;
}

export interface NeutralTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnBrand: string;
  focusRing: string;
}

export interface PaletteAdjustment {
  /** Human-readable explanation, suitable for showing on the branding screen (F5). */
  reason: string;
  requestedHex: string;
  appliedHex: string;
}

export interface DerivedPalette {
  brand: BrandTokens;
  neutral: NeutralTokens;
  /** `null` when the school's colour needed no adjustment to be accessible. */
  adjustment: PaletteAdjustment | null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Picks whichever of white/near-black gives better contrast against `bg`. */
function bestForeground(bg: string): { color: string; contrast: number } {
  const contrastWhite = wcagContrast(bg, WHITE);
  const contrastBlack = wcagContrast(bg, NEAR_BLACK);
  return contrastWhite >= contrastBlack
    ? { color: WHITE, contrast: contrastWhite }
    : { color: NEAR_BLACK, contrast: contrastBlack };
}

function toHex(color: Oklch): string {
  return formatHex(clampChroma(color, 'oklch'));
}

/**
 * Ensures `color` has a foreground reaching AA contrast, adjusting
 * lightness (both directions) and, only if that's insufficient, chroma.
 * Hue is never touched.
 */
function ensureAccessiblePrimary(color: Oklch): {
  color: Oklch;
  adjustment: PaletteAdjustment | null;
} {
  const requestedHex = toHex(color);
  if (bestForeground(requestedHex).contrast >= AA_TEXT_CONTRAST) {
    return { color, adjustment: null };
  }

  // Lightness sweep, both directions, up to 40 steps of 2%.
  for (const direction of [-1, 1] as const) {
    for (let step = 1; step <= 40; step++) {
      const candidate: Oklch = { ...color, l: clamp01(color.l + direction * step * 0.02) };
      const hex = toHex(candidate);
      if (bestForeground(hex).contrast >= AA_TEXT_CONTRAST) {
        return {
          color: candidate,
          adjustment: {
            reason: `Lightness adjusted ${direction < 0 ? 'darker' : 'lighter'} so text stays readable on this colour (WCAG AA).`,
            requestedHex,
            appliedHex: hex,
          },
        };
      }
    }
  }

  // Last resort: reduce chroma toward neutral at the original lightness.
  for (let step = 1; step <= 20; step++) {
    const candidate: Oklch = { ...color, c: Math.max(0, color.c * (1 - step / 20)) };
    const hex = toHex(candidate);
    if (bestForeground(hex).contrast >= AA_TEXT_CONTRAST) {
      return {
        color: candidate,
        adjustment: {
          reason:
            'Colour intensity (chroma) reduced so text stays readable on this colour (WCAG AA).',
          requestedHex,
          appliedHex: hex,
        },
      };
    }
  }

  // Unreachable in practice (pure black/white always clears AA against the
  // other), but never ship a potentially inaccessible primary silently.
  const fallback: Oklch = { ...color, l: 0.3, c: Math.min(color.c, 0.05) };
  return {
    color: fallback,
    adjustment: {
      reason:
        'Colour could not be made accessible by adjustment alone; a safe fallback shade was used.',
      requestedHex,
      appliedHex: toHex(fallback),
    },
  };
}

function deriveBrandTokens(accessiblePrimary: Oklch): BrandTokens {
  const brandPrimary = toHex(accessiblePrimary);
  const hover = toHex({ ...accessiblePrimary, l: clamp01(accessiblePrimary.l - 0.08) });
  const active = toHex({ ...accessiblePrimary, l: clamp01(accessiblePrimary.l - 0.14) });
  const subtle = toHex({ ...accessiblePrimary, l: 0.95, c: accessiblePrimary.c * 0.18 });
  const foreground = bestForeground(brandPrimary).color;

  return {
    brandPrimary,
    brandPrimaryHover: hover,
    brandPrimaryActive: active,
    brandPrimarySubtle: subtle,
    brandPrimaryForeground: foreground,
  };
}

/**
 * Neutrals carry a faint tint of the brand hue (doctrine's own diagram:
 * "brand-tinted or neutral depending on where the token is used") rather
 * than being flat gray — enough for cohesion with the school's identity,
 * never enough to threaten the text contrast guarantees below.
 */
function deriveNeutralTokens(hue: number, brandPrimary: string): NeutralTokens {
  const tint = (l: number, c: number) => toHex({ mode: 'oklch', l, c, h: hue });

  return {
    background: tint(0.985, 0.006),
    surface: tint(1, 0),
    surfaceMuted: tint(0.95, 0.008),
    border: tint(0.87, 0.01),
    borderStrong: tint(0.5, 0.02),
    textPrimary: tint(0.2, 0.01),
    textSecondary: tint(0.35, 0.01),
    textMuted: tint(0.5, 0.01),
    textOnBrand: bestForeground(brandPrimary).color,
    // The ring reuses the (accessible) brand primary — visible, consistent,
    // and doubles as brand reinforcement, per common focus-ring convention.
    focusRing: brandPrimary,
  };
}

export function derivePalette(primaryHex: string): DerivedPalette {
  const parsed = toOklch(primaryHex);
  if (!parsed) {
    throw new Error(`derivePalette: "${primaryHex}" is not a recognisable colour.`);
  }

  const clamped = clampChroma(parsed, 'oklch');
  const { color: accessiblePrimary, adjustment } = ensureAccessiblePrimary(clamped);
  const brand = deriveBrandTokens(accessiblePrimary);
  const neutral = deriveNeutralTokens(accessiblePrimary.h ?? 0, brand.brandPrimary);

  return { brand, neutral, adjustment };
}
