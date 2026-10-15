import { describe, expect, it } from 'vitest';
import { SCHOOL_ADDRESS_RESERVED } from '@atlas/domain';
import { parseTenantSubdomain, RESERVED_SUBDOMAIN_LABELS } from './subdomain.js';

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

  it.each(['api', 'admin', 'www', 'media'])(
    'returns null for the reserved platform label "%s"',
    (label) => {
      expect(parseTenantSubdomain(`${label}.localtest.me`, ROOT)).toBeNull();
    },
  );

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

  it('resolves the per-school API host `<school>.api.<root>` (B23, ADR-0022 amendment)', () => {
    expect(parseTenantSubdomain('greenfield.api.localtest.me', ROOT)).toBe('greenfield');
    expect(parseTenantSubdomain('Greenfield.API.localtest.me:443', ROOT)).toBe('greenfield');
    // The bare API host and reserved labels under it still name no school.
    expect(parseTenantSubdomain('api.localtest.me', ROOT)).toBeNull();
    expect(parseTenantSubdomain('admin.api.localtest.me', ROOT)).toBeNull();
    expect(parseTenantSubdomain('api.api.localtest.me', ROOT)).toBeNull();
    // Only one school label, and only directly under `api`.
    expect(parseTenantSubdomain('a.b.api.localtest.me', ROOT)).toBeNull();
    expect(parseTenantSubdomain('greenfield.apix.localtest.me', ROOT)).toBeNull();
  });

  it('returns null when the Host header is missing', () => {
    expect(parseTenantSubdomain(undefined, ROOT)).toBeNull();
  });
});

describe('RESERVED_SUBDOMAIN_LABELS', () => {
  it('are all refused as a new school address too', () => {
    for (const label of RESERVED_SUBDOMAIN_LABELS) {
      expect(SCHOOL_ADDRESS_RESERVED.has(label)).toBe(true);
    }
  });
});
