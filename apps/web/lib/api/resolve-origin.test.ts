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
});
