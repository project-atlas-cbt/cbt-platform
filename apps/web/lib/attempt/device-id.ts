const STORAGE_KEY = 'atlas.deviceId';

/**
 * F13 — B13's `startIpAddress`/`startDeviceId` binding (ADR-0020 decision 1,
 * the remote-impersonation signal) needs a stable per-device identifier from
 * the client; nothing in this codebase produced one before this phase. A
 * UUID persisted in `localStorage` is sufficient — it only needs to be
 * stable across reloads of the same browser profile, never globally unique
 * across devices in any stronger sense, and it carries no personal data.
 * Sent as the `X-Device-Id` header on start/resume/heartbeat. `randomUUID()`
 * is unavailable in some insecure HTTP development origins, so generation
 * falls back to `getRandomValues()` rather than preventing an attempt from
 * starting before the request is sent.
 */
function generateDeviceId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const generated = generateDeviceId();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / storage disabled — fall back to a per-load id
    // rather than throwing. A binding-mismatch signal firing spuriously in
    // this rare case is an accepted cost (ADR-0020: "counts, never
    // judgements" — it never blocks anything).
    return generateDeviceId();
  }
}
