import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { generateIdempotencyKey } from '@atlas/validation';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { AppHttpException } from './app-http-exception.js';
import { DependencyHealth } from './dependency-health.js';

function makeContext(opts: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const req = {
    method: opts.method,
    url: opts.url,
    body: opts.body ?? null,
    headers: opts.headers ?? {},
    raw: { correlationId: 'test-correlation-id' },
  };
  const res = {
    statusCode: 201,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(result: unknown): CallHandler {
  return { handle: () => of(result) } as CallHandler;
}

/**
 * Nest's real runtime subscribes to whatever intercept() resolves to when
 * it sends the response — a tap() side effect (like our Redis write) never
 * fires until something subscribes. This mirrors that instead of just
 * awaiting the Promise<Observable<...>> intercept() returns.
 */
async function run(
  interceptor: IdempotencyInterceptor,
  ctx: ExecutionContext,
  handler: CallHandler,
) {
  const observable = await interceptor.intercept(ctx, handler);
  return firstValueFrom(observable);
}

describe('IdempotencyInterceptor (ADR-0033)', () => {
  let store: Map<string, string>;
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    store = new Map();
    redis = {
      get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: vi.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    config = { get: vi.fn(() => 86400) };
  });

  it('passes GET requests through untouched', async () => {
    const interceptor = new IdempotencyInterceptor(
      redis as never,
      config as never,
      new DependencyHealth(),
    );
    const ctx = makeContext({ method: 'GET', url: '/v1/health' });
    const result = await run(interceptor, ctx, makeHandler({ status: 'ok' }));
    expect(result).toEqual({ status: 'ok' });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('passes mutating requests through when no key header is present', async () => {
    const interceptor = new IdempotencyInterceptor(
      redis as never,
      config as never,
      new DependencyHealth(),
    );
    const ctx = makeContext({ method: 'POST', url: '/v1/whatever' });
    const result = await run(interceptor, ctx, makeHandler({ created: true }));
    expect(result).toEqual({ created: true });
  });

  it('rejects a non-UUIDv7 Idempotency-Key', async () => {
    const interceptor = new IdempotencyInterceptor(
      redis as never,
      config as never,
      new DependencyHealth(),
    );
    const ctx = makeContext({
      method: 'POST',
      url: '/v1/whatever',
      headers: { 'idempotency-key': 'not-a-uuid' },
    });
    await expect(interceptor.intercept(ctx, makeHandler({}))).rejects.toBeInstanceOf(
      AppHttpException,
    );
  });

  it('stores the response on first use and replays it unchanged on a retry with the same payload', async () => {
    const interceptor = new IdempotencyInterceptor(
      redis as never,
      config as never,
      new DependencyHealth(),
    );
    const key = generateIdempotencyKey();
    const body = { amount: 100 };

    const ctx1 = makeContext({
      method: 'POST',
      url: '/v1/orders',
      body,
      headers: { 'idempotency-key': key },
    });
    const first = await run(interceptor, ctx1, makeHandler({ id: 'order_1' }));
    expect(first).toEqual({ id: 'order_1' });

    const ctx2 = makeContext({
      method: 'POST',
      url: '/v1/orders',
      body,
      headers: { 'idempotency-key': key },
    });
    // A second handler that would return something different if re-executed —
    // proves the interceptor short-circuits rather than re-running it.
    const second = await run(interceptor, ctx2, makeHandler({ id: 'order_2' }));
    expect(second).toEqual({ id: 'order_1' });
  });

  it('rejects a replayed key sent with a different payload', async () => {
    const interceptor = new IdempotencyInterceptor(
      redis as never,
      config as never,
      new DependencyHealth(),
    );
    const key = generateIdempotencyKey();

    const ctx1 = makeContext({
      method: 'POST',
      url: '/v1/orders',
      body: { amount: 100 },
      headers: { 'idempotency-key': key },
    });
    await run(interceptor, ctx1, makeHandler({ id: 'order_1' }));

    const ctx2 = makeContext({
      method: 'POST',
      url: '/v1/orders',
      body: { amount: 200 },
      headers: { 'idempotency-key': key },
    });
    await expect(run(interceptor, ctx2, makeHandler({ id: 'order_2' }))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REPLAY_MISMATCH',
    });
  });

  it('B22: fails open when Redis is unavailable — the request still runs, no unhandled rejection', async () => {
    redis.get.mockRejectedValueOnce(new Error('Command timed out'));
    redis.set.mockRejectedValue(new Error('Command timed out'));
    const health = new DependencyHealth();
    const interceptor = new IdempotencyInterceptor(redis as never, config as never, health);
    const ctx = makeContext({
      method: 'POST',
      url: '/v1/things',
      body: { a: 1 },
      headers: { 'idempotency-key': generateIdempotencyKey() },
    });
    await expect(run(interceptor, ctx, makeHandler({ id: 'x' }))).resolves.toEqual({ id: 'x' });
    expect(health.isDegraded('redis')).toBe(true);
  });
});
