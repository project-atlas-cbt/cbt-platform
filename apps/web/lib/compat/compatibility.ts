/**
 * F20 (DoD 12; audit R-10) — the pre-flight compatibility check run on the
 * assessment preview, so an unsupported machine is found *before* a
 * student's timer starts, not mid-attempt.
 *
 * Declared baseline (owner decision 2026-10-03,
 * docs/operations/browser-and-hardware-baseline.md): Chrome/Edge ≥ 111,
 * Firefox ≥ 115 (ESR — the route for Windows 7/8.1 labs), Safari ≥ 16.4;
 * lab screens 1366×768.
 *
 * Feature detection first — it tests what the exam engine actually uses.
 * The user-agent version is only a secondary warning. A browser too old to
 * parse the app bundle never reaches this code at all; `public/compat-probe.js`
 * (plain ES5) covers that case with a static notice.
 *
 * - `fail`: the exam engine cannot run safely here — Start is disabled.
 * - `warn`: the exam runs, with reduced resilience or comfort — shown, not blocking.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CompatibilityResult {
  id: string;
  label: string;
  status: CheckStatus;
  /** Plain-language explanation for a student or invigilator. */
  detail: string;
}

export const SUPPORTED_BROWSERS = {
  chrome: 111,
  edge: 111,
  firefox: 115,
  safari: 16.4,
} as const;

export const LAB_BASELINE_VIEWPORT = { width: 1366, height: 768 } as const;
/** Below this, layouts degrade noticeably (the runtime still works). */
const MIN_COMFORTABLE_VIEWPORT = { width: 1024, height: 600 } as const;

export interface CompatibilityEnvironment {
  userAgent: string;
  hasIndexedDb: boolean;
  hasFetch: boolean;
  hasWebLocks: boolean;
  hasBroadcastChannel: boolean;
  hasCacheStorage: boolean;
  hasServiceWorker: boolean;
  hasSubtleCrypto: boolean;
  secureContext: boolean;
  online: boolean;
  viewport: { width: number; height: number };
  /** Free storage quota in bytes, if the browser reports it. */
  storageAvailableBytes: number | null;
}

/** Bytes the paper needs locally (pre-cache ciphertext + decrypted copy). */
export interface CompatibilityNeeds {
  mediaBytes: number;
}

interface ParsedBrowser {
  name: keyof typeof SUPPORTED_BROWSERS | 'other';
  version: number;
}

export function parseBrowser(userAgent: string): ParsedBrowser {
  const edge = /Edg\/(\d+)/.exec(userAgent);
  if (edge) return { name: 'edge', version: Number(edge[1]) };
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return { name: 'firefox', version: Number(firefox[1]) };
  const chrome = /Chrom(?:e|ium)\/(\d+)/.exec(userAgent);
  if (chrome) return { name: 'chrome', version: Number(chrome[1]) };
  const safari = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(userAgent);
  if (safari) return { name: 'safari', version: Number(safari[1]) };
  return { name: 'other', version: 0 };
}

function browserCheck(userAgent: string): CompatibilityResult {
  const browser = parseBrowser(userAgent);
  const label = 'Browser version';
  if (browser.name === 'other') {
    return {
      id: 'browser',
      label,
      status: 'warn',
      detail:
        'This browser is not on the supported list. Use a recent Chrome, Edge or Firefox if anything does not work.',
    };
  }
  const minimum = SUPPORTED_BROWSERS[browser.name];
  if (browser.version < minimum) {
    const advice =
      browser.name === 'chrome' || browser.name === 'edge'
        ? ' On older Windows (7 or 8.1), install Firefox ESR, which is still supported there.'
        : '';
    return {
      id: 'browser',
      label,
      status: 'warn',
      detail: `This browser is older than supported (needs ${browser.name} ${minimum} or newer).${advice}`,
    };
  }
  return { id: 'browser', label, status: 'pass', detail: 'Supported browser.' };
}

function formatMb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

export function evaluateCompatibility(
  env: CompatibilityEnvironment,
  needs: CompatibilityNeeds,
): CompatibilityResult[] {
  const results: CompatibilityResult[] = [browserCheck(env.userAgent)];

  results.push(
    env.hasIndexedDb && env.hasFetch
      ? {
          id: 'answer-storage',
          label: 'Saving answers on this computer',
          status: 'pass',
          detail: 'Answers are kept safely even if the network drops.',
        }
      : {
          id: 'answer-storage',
          label: 'Saving answers on this computer',
          status: 'fail',
          detail:
            'This browser cannot store answers locally (private browsing or an outdated browser). Use a normal window of a supported browser.',
        },
  );

  results.push(
    env.hasWebLocks && env.hasBroadcastChannel
      ? {
          id: 'one-tab',
          label: 'One exam tab at a time',
          status: 'pass',
          detail: 'Only one tab can write answers.',
        }
      : {
          id: 'one-tab',
          label: 'One exam tab at a time',
          status: 'warn',
          detail: 'Keep the exam open in a single tab only.',
        },
  );

  const offlineReady = env.hasCacheStorage && env.hasServiceWorker && env.hasSubtleCrypto;
  results.push(
    offlineReady
      ? {
          id: 'offline-media',
          label: 'Exam materials offline',
          status: 'pass',
          detail: 'Pictures and diagrams stay available if the network drops.',
        }
      : {
          id: 'offline-media',
          label: 'Exam materials offline',
          status: 'warn',
          detail: env.secureContext
            ? 'This browser cannot keep exam pictures offline; they need the network.'
            : 'This connection is not secure (https), so exam pictures cannot be kept offline.',
        },
  );

  const needed = needs.mediaBytes * 2; // ciphertext, then the decrypted copy
  if (env.storageAvailableBytes !== null && needed > 0) {
    results.push(
      env.storageAvailableBytes >= needed
        ? {
            id: 'storage',
            label: 'Storage space',
            status: 'pass',
            detail: `Enough space for this paper (${formatMb(needed)}).`,
          }
        : {
            id: 'storage',
            label: 'Storage space',
            status: 'fail',
            detail: `Not enough browser storage for this paper (needs ${formatMb(needed)}). Free disk space or use another computer.`,
          },
    );
  }

  const { width, height } = env.viewport;
  results.push(
    width >= MIN_COMFORTABLE_VIEWPORT.width && height >= MIN_COMFORTABLE_VIEWPORT.height
      ? { id: 'screen', label: 'Screen size', status: 'pass', detail: 'Screen size is fine.' }
      : {
          id: 'screen',
          label: 'Screen size',
          status: 'warn',
          detail: `The window is small. Maximise the browser window (or reduce zoom); exams are laid out for ${LAB_BASELINE_VIEWPORT.width}×${LAB_BASELINE_VIEWPORT.height} screens.`,
        },
  );

  results.push(
    env.online
      ? { id: 'network', label: 'Network', status: 'pass', detail: 'Connected.' }
      : {
          id: 'network',
          label: 'Network',
          status: 'fail',
          detail: 'You are offline. Starting the exam needs a connection.',
        },
  );

  return results;
}

export function isBlocking(results: CompatibilityResult[]): boolean {
  return results.some((r) => r.status === 'fail');
}

/** Reads the real environment. Browser-only. */
export async function readEnvironment(): Promise<CompatibilityEnvironment> {
  let storageAvailableBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota !== undefined && estimate.usage !== undefined) {
      storageAvailableBytes = Math.max(0, estimate.quota - estimate.usage);
    }
  } catch {
    storageAvailableBytes = null;
  }
  return {
    userAgent: navigator.userAgent,
    hasIndexedDb: typeof indexedDB !== 'undefined',
    hasFetch: typeof fetch === 'function',
    hasWebLocks: typeof navigator.locks !== 'undefined',
    hasBroadcastChannel: typeof BroadcastChannel !== 'undefined',
    hasCacheStorage: typeof caches !== 'undefined',
    hasServiceWorker: 'serviceWorker' in navigator,
    hasSubtleCrypto: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
    secureContext: window.isSecureContext,
    online: navigator.onLine,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    storageAvailableBytes,
  };
}
