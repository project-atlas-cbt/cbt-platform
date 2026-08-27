import { describe, expect, it } from 'vitest';
import { derivePalette } from './derive-palette';

/**
 * Full algorithmic coverage (the 8-sample-colour WCAG AA sweep, hue
 * preservation, adjustment reporting, ...) moved to
 * packages/domain/src/branding/derive-palette.test.ts alongside the real
 * implementation in B4. This file only proves the re-export wiring here
 * still resolves and returns the expected shape.
 */
describe('derivePalette (re-export smoke test)', () => {
  it('resolves from @atlas/domain and returns a plausible palette shape', () => {
    const palette = derivePalette('#2563EB');
    expect(palette.brand.brandPrimary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.neutral.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.adjustment).toBeNull();
  });
});
