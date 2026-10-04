import { describe, expect, it } from 'vitest';
import {
  evaluateCompatibility,
  isBlocking,
  parseBrowser,
  type CompatibilityEnvironment,
} from './compatibility';

const CHROME_120 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CHROME_109_WIN7 =
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';
const FIREFOX_115_WIN7 =
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0';
const EDGE_118 = `${CHROME_120} Edg/118.0.2088.46`;
const SAFARI_17 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';

const good: CompatibilityEnvironment = {
  userAgent: CHROME_120,
  hasIndexedDb: true,
  hasFetch: true,
  hasWebLocks: true,
  hasBroadcastChannel: true,
  hasCacheStorage: true,
  hasServiceWorker: true,
  hasSubtleCrypto: true,
  secureContext: true,
  online: true,
  viewport: { width: 1366, height: 657 },
  storageAvailableBytes: 500_000_000,
};

const byId = (env: CompatibilityEnvironment, mediaBytes = 6_000_000) =>
  new Map(evaluateCompatibility(env, { mediaBytes }).map((r) => [r.id, r]));

describe('parseBrowser', () => {
  it('recognises the declared matrix', () => {
    expect(parseBrowser(CHROME_120)).toEqual({ name: 'chrome', version: 120 });
    expect(parseBrowser(EDGE_118)).toEqual({ name: 'edge', version: 118 });
    expect(parseBrowser(FIREFOX_115_WIN7)).toEqual({ name: 'firefox', version: 115 });
    expect(parseBrowser(SAFARI_17)).toEqual({ name: 'safari', version: 17.1 });
  });
});

describe('evaluateCompatibility (F20 DoD 12, R-10)', () => {
  it('a supported lab machine passes everything', () => {
    const results = evaluateCompatibility(good, { mediaBytes: 6_000_000 });
    expect(results.every((r) => r.status === 'pass')).toBe(true);
    expect(isBlocking(results)).toBe(false);
  });

  it('Windows 7 Chrome 109 is warned and pointed at Firefox ESR', () => {
    const browser = byId({ ...good, userAgent: CHROME_109_WIN7 }).get('browser')!;
    expect(browser.status).toBe('warn');
    expect(browser.detail).toMatch(/Firefox ESR/);
  });

  it('Firefox 115 ESR on Windows 7 is supported', () => {
    expect(byId({ ...good, userAgent: FIREFOX_115_WIN7 }).get('browser')!.status).toBe('pass');
  });

  it('no local answer storage blocks Start', () => {
    const results = evaluateCompatibility({ ...good, hasIndexedDb: false }, { mediaBytes: 0 });
    expect(isBlocking(results)).toBe(true);
  });

  it('too little storage for the paper blocks Start', () => {
    const storage = byId({ ...good, storageAvailableBytes: 5_000_000 }).get('storage')!;
    expect(storage.status).toBe('fail');
    expect(storage.detail).toMatch(/12 MB/);
  });

  it('an insecure connection only warns (exam works online, media not offline)', () => {
    const results = evaluateCompatibility(
      { ...good, secureContext: false, hasCacheStorage: false, hasSubtleCrypto: false },
      { mediaBytes: 0 },
    );
    expect(results.find((r) => r.id === 'offline-media')!.detail).toMatch(/not secure/);
    expect(isBlocking(results)).toBe(false);
  });

  it('being offline blocks Start; a small window only warns', () => {
    expect(isBlocking(evaluateCompatibility({ ...good, online: false }, { mediaBytes: 0 }))).toBe(
      true,
    );
    const screen = byId({ ...good, viewport: { width: 800, height: 500 } }).get('screen')!;
    expect(screen.status).toBe('warn');
  });
});
