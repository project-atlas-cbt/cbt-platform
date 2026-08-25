import { describe, expect, it } from 'vitest';
import { parseTenantSubdomain } from './subdomain.js';

const ROOT = 'localtest.me';

describe('parseTenantSubdomain (ADR-0005)', () => {
  it('extracts a school subdomain label from a matching host', () => {
    expect(parseTenantSubdomain('greenfield.localtest.me', ROOT)).toBe('greenfield');
  });

  it('strips a port before parsing', () => {
    expect(parseTenantSubdomain('greenfield.localtest.me:3001', ROOT)).toBe('greenfield');
  });

  it('is case-insensitive on both host and root domain', () => {
    expect(parseTenantSubdomain('Greenfield.LocalTest.ME', ROOT)).toBe('greenfield');
  });

  it('returns null for the bare root domain', () => {
    expect(parseTenantSubdomain('localtest.me', ROOT)).toBeNull();
    expect(parseTenantSubdomain('localtest.me:3001', ROOT)).toBeNull();
  });

  it.each(['api', 'admin', 'www'])('returns null for the reserved platform label "%s"', (label) => {
    expect(parseTenantSubdomain(`${label}.localtest.me`, ROOT)).toBeNull();
  });

  it('returns null for a host entirely outside the root domain', () => {
    expect(parseTenantSubdomain('localhost:3001', ROOT)).toBeNull();
    expect(parseTenantSubdomain('example.com', ROOT)).toBeNull();
  });

  it('returns null for a host that merely ends with the root domain as a substring, not a real subdomain', () => {
    // "evillocaltest.me" is not "<label>.localtest.me" — must not match.
    expect(parseTenantSubdomain('evillocaltest.me', ROOT)).toBeNull();
  });

  it('returns null for a multi-label prefix (school subdomains are a single DNS label)', () => {
    expect(parseTenantSubdomain('foo.bar.localtest.me', ROOT)).toBeNull();
  });

  it('returns null when the Host header is missing', () => {
    expect(parseTenantSubdomain(undefined, ROOT)).toBeNull();
  });
});
