import { describe, expect, it } from 'vitest';
import { converter, wcagContrast } from 'culori';
import { derivePalette } from './derive-palette';

const toOklch = converter('oklch');

const AA_TEXT_CONTRAST = 4.5;

// A deliberately wide range: a typical mid-saturation school blue/green, a
// pure primary (red/blue/green), a near-white pastel that cannot possibly
// yield an accessible foreground without adjustment, a very dark colour,
// and a low-saturation neutral gray.
const SAMPLE_COLOURS = [
  '#2563EB', // typical brand blue
  '#15803D', // typical brand green
  '#FF0000', // pure red
  '#FFFF00', // pure yellow — should force adjustment
  '#5E8284', // mid-tone teal-gray — passes AA with neither white nor black text
  '#111827', // very dark navy
  '#9CA3AF', // mid gray, low chroma
  '#8B5CF6', // violet
];

describe('derivePalette', () => {
  it.each(SAMPLE_COLOURS)('produces an AA-accessible brand-primary foreground for %s', (hex) => {
    const { brand } = derivePalette(hex);
    const contrast = wcagContrast(brand.brandPrimary, brand.brandPrimaryForeground);
    expect(contrast).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });

  it.each(SAMPLE_COLOURS)(
    'produces AA-accessible neutral text tiers against surface for %s',
    (hex) => {
      const { neutral } = derivePalette(hex);
      for (const tier of [neutral.textPrimary, neutral.textSecondary, neutral.textMuted] as const) {
        expect(wcagContrast(neutral.surface, tier)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
      }
    },
  );

  it('reports no adjustment for a colour that is already accessible', () => {
    const { adjustment } = derivePalette('#2563EB');
    expect(adjustment).toBeNull();
  });

  it('reports and explains an adjustment for a mid-tone colour that is accessible with neither white nor black text', () => {
    const { adjustment, brand } = derivePalette('#5E8284');
    expect(adjustment).not.toBeNull();
    expect(adjustment?.requestedHex.toLowerCase()).toBe('#5e8284');
    expect(adjustment?.appliedHex.toLowerCase()).toBe(brand.brandPrimary.toLowerCase());
    expect(adjustment?.reason).toMatch(/lightness|chroma/i);
  });

  it('never changes hue when adjusting for accessibility', () => {
    // #5E8284 has hue ~200 in OKLCH; adjustment should move lightness/
    // chroma only, so the resulting hue stays close to the input.
    const inputHue = toOklch('#5E8284')?.h ?? 0;
    const { brand } = derivePalette('#5E8284');
    const resultHue = toOklch(brand.brandPrimary)?.h ?? 0;
    expect(Math.abs(resultHue - inputHue)).toBeLessThan(15);
  });

  it('derives distinct hover and active shades from the primary', () => {
    const { brand } = derivePalette('#2563EB');
    expect(brand.brandPrimaryHover).not.toBe(brand.brandPrimary);
    expect(brand.brandPrimaryActive).not.toBe(brand.brandPrimaryHover);
  });

  it('derives a light, low-chroma subtle tint suitable for backgrounds', () => {
    const { neutral, brand } = derivePalette('#2563EB');
    // The subtle tint should be much lighter than the primary itself, and
    // standard body text should read comfortably on it.
    expect(wcagContrast(brand.brandPrimarySubtle, neutral.textPrimary)).toBeGreaterThanOrEqual(
      AA_TEXT_CONTRAST,
    );
  });

  it('throws a clear error for an unparseable colour rather than silently defaulting', () => {
    expect(() => derivePalette('not-a-colour')).toThrow();
  });
});
