import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '@atlas/config';
import { MarketingIngestGuard } from './marketing-ingest.guard.js';

const KEY = 'k'.repeat(40);
const guard = (key: string | undefined) =>
  new MarketingIngestGuard({ get: () => key } as unknown as ConfigService<Env, true>);
const ctx = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('MarketingIngestGuard', () => {
  it('hides the routes (404) when no key is configured', () => {
    expect(() => guard(undefined).canActivate(ctx({ 'x-marketing-key': KEY }))).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('refuses a missing or different key', () => {
    expect(() => guard(KEY).canActivate(ctx({}))).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
    expect(() => guard(KEY).canActivate(ctx({ 'x-marketing-key': `${KEY}x` }))).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('lets the configured key through', () => {
    expect(guard(KEY).canActivate(ctx({ 'x-marketing-key': KEY }))).toBe(true);
  });
});
