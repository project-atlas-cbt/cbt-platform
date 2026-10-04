import { describe, expect, it } from 'vitest';
import { resolveApiOrigin } from './resolve-origin';

describe('resolveApiOrigin', () => {
  it('uses the fallback origin unchanged on plain localhost', () => {
    expect(resolveApiOrigin('localhost', 'http:', 'http://localhost:3001', '3001')).toBe(
      'http://localhost:3001',
    );
  });

  it('uses the fallback origin unchanged on 127.0.0.1', () => {
    expect(resolveApiOrigin('127.0.0.1', 'http:', 'http://localhost:3001', '3001')).toBe(
      'http://localhost:3001',
    );
  });

  it('mirrors a school subdomain onto the API port', () => {
    expect(
      resolveApiOrigin('greenfield.localtest.me', 'http:', 'http://localhost:3001', '3001'),
    ).toBe('http://greenfield.localtest.me:3001');
  });

  it('mirrors the platform-admin subdomain onto the API port', () => {
    expect(resolveApiOrigin('admin.localtest.me', 'http:', 'http://localhost:3001', '3001')).toBe(
      'http://admin.localtest.me:3001',
    );
  });

  it('preserves https when the page itself is https', () => {
    expect(
      resolveApiOrigin('greenfield.atlas.app', 'https:', 'http://localhost:3001', '3001'),
    ).toBe('https://greenfield.atlas.app:3001');
  });

  it('uses a distinct configured API port when given one', () => {
    expect(
      resolveApiOrigin('greenfield.localtest.me', 'http:', 'http://localhost:3001', '4001'),
    ).toBe('http://greenfield.localtest.me:4001');
  });

  it('uses the per-school API host in production when no API port is set (B23)', () => {
    expect(resolveApiOrigin('greenfield.atlas.app', 'https:', 'https://api.atlas.app', '')).toBe(
      'https://greenfield.api.atlas.app',
    );
  });

  it('maps the platform-admin host onto its API host in production (B23)', () => {
    expect(resolveApiOrigin('admin.atlas.app', 'https:', 'https://api.atlas.app', '')).toBe(
      'https://admin.api.atlas.app',
    );
  });

  it('uses the fallback origin for a bare hostname with no API port', () => {
    expect(resolveApiOrigin('intranet', 'https:', 'https://api.atlas.app', '')).toBe(
      'https://api.atlas.app',
    );
  });
});
