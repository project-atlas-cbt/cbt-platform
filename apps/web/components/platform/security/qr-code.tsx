'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * F20 — renders an `otpauth://` URI as a QR code for authenticator apps.
 * The matrix comes from `uqr` (MIT, zero dependencies) and is drawn as
 * React SVG elements — no `innerHTML`, so nothing for the CSP to allow.
 * One path for all dark modules keeps the DOM small. Dark-on-white with a
 * quiet zone regardless of theme: scanners need the contrast.
 */
export function QrCode({
  value,
  label,
  size = 192,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const { path, dimension } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 4 });
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, dimension: qr.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className="rounded-sm border border-border"
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
