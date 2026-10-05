/**
 * A short, human label for a session's user agent ("Chrome on Windows") —
 * enough to recognise your own laptop or phone in the session list. Not a
 * fingerprint and not used for any decision; unknown agents fall back to
 * "Unknown device".
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//u, 'Edge'],
  [/OPR\/|Opera/u, 'Opera'],
  [/SamsungBrowser\//u, 'Samsung Internet'],
  [/Firefox\//u, 'Firefox'],
  [/Chrome\/|CriOS\//u, 'Chrome'],
  [/Safari\//u, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/u, 'Android'],
  [/iPhone|iPad|iPod/u, 'iOS'],
  [/Windows/u, 'Windows'],
  [/CrOS/u, 'ChromeOS'],
  [/Mac OS X|Macintosh/u, 'macOS'],
  [/Linux/u, 'Linux'],
];

export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
