import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  originOf,
  sentryOriginFromDsn,
  type CspInputs,
} from './csp';

const base: CspInputs = {
  nonce: 'abc123==',
  apiOrigin: 'https://api.atlas.example',
  mediaOrigin: 'https://media.atlas.example',
  sentryOrigin: '',
  secure: true,
  dev: false,
};

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split('; ').map((d) => {
      const [name, ...rest] = d.split(' ');
      return [name!, rest.join(' ')];
    }),
  );
}

describe('buildContentSecurityPolicy (docs/security/web-csp-policy.md)', () => {
  it('production scripts are nonce + strict-dynamic only — no unsafe-inline, no unsafe-eval', () => {
    const d = directives(buildContentSecurityPolicy(base));
    expect(d.get('script-src')).toBe("'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(buildContentSecurityPolicy(base)).not.toMatch(/script-src[^;]*unsafe/);
  });

  it('styles: nonce for <style> elements, attributes allowed (owner decision Q3)', () => {
    const d = directives(buildContentSecurityPolicy(base));
    expect(d.get('style-src')).toBe("'self' 'nonce-abc123=='");
    expect(d.get('style-src-attr')).toBe("'unsafe-inline'");
  });

  it('names the API and media hosts where the client really uses them (F20 amendment)', () => {
    const d = directives(buildContentSecurityPolicy(base));
    expect(d.get('connect-src')).toBe(
      "'self' https://api.atlas.example https://media.atlas.example",
    );
    expect(d.get('img-src')).toContain('https://media.atlas.example');
    expect(d.get('media-src')).toBe("'self' blob: https://media.atlas.example");
    expect(d.get('connect-src')).not.toContain('*');
  });

  it('locks framing, base, objects and forms down', () => {
    const d = directives(buildContentSecurityPolicy(base));
    expect(d.get('frame-ancestors')).toBe("'none'");
    expect(d.get('base-uri')).toBe("'none'");
    expect(d.get('object-src')).toBe("'none'");
    expect(d.get('form-action')).toBe("'self'");
    expect(d.get('worker-src')).toBe("'self'");
    expect(d.has('upgrade-insecure-requests')).toBe(true);
  });

  it('adds the Sentry ingest origin only when configured', () => {
    const d = directives(
      buildContentSecurityPolicy({ ...base, sentryOrigin: 'https://o1.ingest.sentry.io' }),
    );
    expect(d.get('connect-src')).toContain('https://o1.ingest.sentry.io');
  });

  it('omits upgrade-insecure-requests on plain http (local, e2e)', () => {
    expect(buildContentSecurityPolicy({ ...base, secure: false })).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('dev relaxes exactly what next dev needs', () => {
    const d = directives(buildContentSecurityPolicy({ ...base, dev: true }));
    expect(d.get('script-src')).toContain("'unsafe-eval'");
    expect(d.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(d.get('connect-src')).toContain('ws:');
  });

  it('a missing media origin leaves no empty token behind', () => {
    const policy = buildContentSecurityPolicy({ ...base, mediaOrigin: '' });
    expect(policy).not.toMatch(/ {2}|undefined/);
  });
});

describe('buildSecurityHeaders', () => {
  it('sets every header the policy requires', () => {
    const h = buildSecurityHeaders({ ...base, reportOnly: false });
    expect(h['Content-Security-Policy']).toBeDefined();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(), payment=()');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('report-only mode swaps the header name (staging first, per the policy)', () => {
    const h = buildSecurityHeaders({ ...base, reportOnly: true });
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(h['Content-Security-Policy-Report-Only']).toContain("'strict-dynamic'");
  });

  it('never sends HSTS over plain http', () => {
    expect(buildSecurityHeaders({ ...base, secure: false, reportOnly: false })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });
});

describe('helpers', () => {
  it('originOf tolerates bad config', () => {
    expect(originOf('https://bucket.s3.eu-west-1.amazonaws.com/path')).toBe(
      'https://bucket.s3.eu-west-1.amazonaws.com',
    );
    expect(originOf('not a url')).toBe('');
    expect(originOf(undefined)).toBe('');
  });

  it('a Sentry DSN yields its ingest origin without the key', () => {
    expect(sentryOriginFromDsn('https://publickey@o42.ingest.sentry.io/7')).toBe(
      'https://o42.ingest.sentry.io',
    );
  });

  it('nonces are unique base64', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(generateNonce()).not.toBe(a);
  });
});
