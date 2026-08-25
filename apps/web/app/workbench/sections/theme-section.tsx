'use client';

import { useMemo, useState } from 'react';
import { derivePalette } from '@/lib/theme/derive-palette';
import { Section, Swatch } from '../section';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// Deliberately includes one colour the derivation must adjust (see
// derive-palette.test.ts's calibration for why this exact hex was chosen)
// so the workbench proves the accessibility-adjustment path, not just the
// happy path.
const SAMPLE_COLOURS = ['#2563EB', '#15803D', '#8B5CF6', '#5E8284'];

export function ThemeSection() {
  const [customHex, setCustomHex] = useState('#2563EB');

  const custom = useMemo(() => {
    try {
      return derivePalette(customHex);
    } catch {
      return null;
    }
  }, [customHex]);

  return (
    <Section title="Theming engine">
      <p className="max-w-2xl text-sm text-text-secondary">
        One school colour derives every brand/neutral token (doctrine §9). Accessibility outranks
        exact reproduction — a colour that can&apos;t yield an AA-accessible foreground is adjusted
        (lightness, then chroma; never hue), and the adjustment is reported rather than applied
        silently.
      </p>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="workbench-hex">Try a colour</Label>
        <Input
          id="workbench-hex"
          value={customHex}
          onChange={(event) => setCustomHex(event.target.value)}
          placeholder="#2563EB"
        />
      </div>

      {custom ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          {custom.adjustment ? (
            <Badge status="warning">Adjusted: {custom.adjustment.reason}</Badge>
          ) : (
            <Badge status="success">No adjustment needed</Badge>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Swatch label="brand-primary" hex={custom.brand.brandPrimary} />
            <Swatch label="brand-primary-hover" hex={custom.brand.brandPrimaryHover} />
            <Swatch label="brand-primary-active" hex={custom.brand.brandPrimaryActive} />
            <Swatch label="brand-primary-subtle" hex={custom.brand.brandPrimarySubtle} />
            <Swatch label="brand-primary-foreground" hex={custom.brand.brandPrimaryForeground} />
            <Swatch label="focus-ring" hex={custom.neutral.focusRing} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-danger">Not a recognisable colour.</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SAMPLE_COLOURS.map((hex) => {
          const palette = derivePalette(hex);
          return (
            <div key={hex} className="space-y-2 rounded-md border border-border p-3">
              <Swatch label={hex} hex={palette.brand.brandPrimary} />
              {palette.adjustment ? (
                <p className="text-xs text-warning">Adjusted for contrast</p>
              ) : (
                <p className="text-xs text-text-muted">Accessible as-is</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Badge status="success">Success</Badge>
        <Badge status="warning">Warning</Badge>
        <Badge status="danger">Danger</Badge>
        <Badge status="info">Info</Badge>
      </div>
    </Section>
  );
}
