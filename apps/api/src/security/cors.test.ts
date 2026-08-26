import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './cors.js';

const WEB_ORIGIN = 'http://localhost:3000';
const ROOT = 'atlas.app';

describe('isAllowedOrigin (ADR-0022)', () => {
  it('allows requests with no Origin header (same-origin / non-browser)', () => {
    expect(isAllowedOrigin(undefined, WEB_ORIGIN, ROOT)).toBe(true);
  });

  it('allows the exact configured WEB_ORIGIN (local dev escape hatch)', () => {
    expect(isAllowedOrigin(WEB_ORIGIN, WEB_ORIGIN, ROOT)).toBe(true);
  });

  it('allows any https subdomain of the root domain', () => {
    expect(isAllowedOrigin('https://greenfield.atlas.app', WEB_ORIGIN, ROOT)).toBe(true);
    expect(isAllowedOrigin('https://admin.atlas.app', WEB_ORIGIN, ROOT)).toBe(true);
  });

  it('allows the bare https root domain itself', () => {
    expect(isAllowedOrigin('https://atlas.app', WEB_ORIGIN, ROOT)).toBe(true);
  });

  it('rejects an http origin under the root domain (only WEB_ORIGIN gets the http exception)', () => {
    expect(isAllowedOrigin('http://greenfield.atlas.app', WEB_ORIGIN, ROOT)).toBe(false);
  });

  it('rejects an unrelated domain', () => {
    expect(isAllowedOrigin('https://evil.example.com', WEB_ORIGIN, ROOT)).toBe(false);
  });

  it('rejects a domain that merely ends with the root domain as a substring', () => {
    expect(isAllowedOrigin('https://notatlas.app', WEB_ORIGIN, ROOT)).toBe(false);
  });

  it('rejects a malformed origin rather than throwing', () => {
    expect(isAllowedOrigin('not-a-url', WEB_ORIGIN, ROOT)).toBe(false);
  });

  describe('allowInsecureSubdomains (F1 local-dev subdomain testing)', () => {
    it('defaults to false — http subdomains still rejected with no 4th argument', () => {
      expect(isAllowedOrigin('http://greenfield.atlas.app', WEB_ORIGIN, ROOT)).toBe(false);
    });

    it('allows an http subdomain of the root domain when explicitly opted in', () => {
      expect(isAllowedOrigin('http://greenfield.atlas.app', WEB_ORIGIN, ROOT, true)).toBe(true);
    });

    it('still allows https subdomains when opted in (not an either/or)', () => {
      expect(isAllowedOrigin('https://greenfield.atlas.app', WEB_ORIGIN, ROOT, true)).toBe(true);
    });

    it('still rejects an unrelated http domain even when opted in', () => {
      expect(isAllowedOrigin('http://evil.example.com', WEB_ORIGIN, ROOT, true)).toBe(false);
    });
  });
});
