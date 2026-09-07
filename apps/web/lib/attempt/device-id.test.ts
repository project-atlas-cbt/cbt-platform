import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceId } from './device-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('getDeviceId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a generated device id', () => {
    const first = getDeviceId();
    const second = getDeviceId();

    expect(first).toMatch(UUID_PATTERN);
    expect(second).toBe(first);
  });

  it('generates a UUID when randomUUID is unavailable on an insecure origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(7);
        return bytes;
      },
    });

    const deviceId = getDeviceId();

    expect(deviceId).toMatch(UUID_PATTERN);
  });
});
