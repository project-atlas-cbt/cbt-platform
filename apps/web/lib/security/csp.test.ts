import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './csp';

describe('buildContentSecurityPolicy', () => {
  it('uses a nonce and blocks inline script execution', () => {
    const policy = buildContentSecurityPolicy('nonce-value', 'https://api.example.test', true);
    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain('connect-src');
    expect(policy).toContain('https://api.example.test');
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('permits local websocket/http connections only outside production', () => {
    const policy = buildContentSecurityPolicy('dev', undefined, false);
    expect(policy).toContain('ws:');
    expect(policy).toContain('http:');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });
});
