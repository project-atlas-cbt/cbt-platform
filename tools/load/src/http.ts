import http from 'node:http';
import { performance } from 'node:perf_hooks';
import type { Recorder } from './metrics.js';

/**
 * A minimal HTTP client over `node:http` — deliberately not `fetch`: the
 * harness must set the `Host` header (tenant subdomain, ADR-0005) while
 * connecting to a fixed address, and `X-Forwarded-For` (one source IP per
 * simulated lab, ADR-0032 / R-09), both of which `fetch` forbids or
 * rewrites. No dependency is added for it (AGENTS.md §9).
 */

export interface Target {
  /** e.g. `127.0.0.1` or `host.docker.internal` */
  address: string;
  port: number;
  /** `/v1` — the API's global prefix. */
  prefix: string;
}

export function parseTargets(spec: string): Target[] {
  // "http://127.0.0.1:3001,http://127.0.0.1:3002" — several API processes,
  // round-robined per virtual user (horizontal scaling without an LB).
  return spec.split(',').map((raw) => {
    const url = new URL(raw.trim());
    return {
      address: url.hostname,
      port: Number(url.port || 80),
      prefix: url.pathname === '/' ? '/v1' : url.pathname.replace(/\/$/, ''),
    };
  });
}

export interface Response<T = unknown> {
  status: number;
  body: T;
  raw: string;
  headers: http.IncomingHttpHeaders;
  ms: number;
}

export class NetworkFailure extends Error {
  constructor(
    message: string,
    readonly ms: number,
  ) {
    super(message);
    this.name = 'NetworkFailure';
  }
}

/** One browser: its own keep-alive socket pool, cookie jar and CSRF token. */
export class Client {
  private readonly cookies = new Map<string, string>();
  private csrfToken: string | undefined;
  readonly agent: http.Agent;

  constructor(
    readonly target: Target,
    readonly host: string,
    readonly sourceIp: string,
    private readonly recorder: Recorder,
    readonly deviceId: string,
    // Browsers open ~6 connections per origin; the exam client uses 1-2
    // concurrently in practice (one sync flush in flight at a time).
    maxSockets = 4,
    private readonly timeoutMs = 30_000,
  ) {
    this.agent = new http.Agent({ keepAlive: true, maxSockets });
  }

  close(): void {
    this.agent.destroy();
  }

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get hasSession(): boolean {
    return this.cookies.has('atlas_session');
  }

  /** `GET /tenant/resolve` → `_csrf` cookie + token, exactly as the web app boots. */
  async resolveTenant(): Promise<void> {
    const res = await this.request<{ csrfToken: string }>('GET', '/tenant/resolve', {
      label: 'tenant.resolve',
    });
    if (res.status !== 200) throw new Error(`tenant/resolve ${res.status}: ${res.raw}`);
    this.csrfToken = res.body.csrfToken;
  }

  async login(identifier: string, password: string): Promise<Response> {
    if (!this.csrfToken) await this.resolveTenant();
    return this.request('POST', '/auth/login', {
      label: 'auth.login',
      body: { identifier, password },
    });
  }

  request<T = unknown>(
    method: string,
    path: string,
    opts: { label: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response<T>> {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = {
      host: this.host,
      'x-forwarded-for': this.sourceIp,
      'x-device-id': this.deviceId,
      accept: 'application/json',
      ...opts.headers,
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;
    if (method !== 'GET' && this.csrfToken) headers['x-csrf-token'] = this.csrfToken;
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }

    const started = performance.now();
    return new Promise<Response<T>>((resolve, reject) => {
      const req = http.request(
        {
          host: this.target.address,
          port: this.target.port,
          path: `${this.target.prefix}${path}`,
          method,
          headers,
          agent: this.agent,
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const ms = performance.now() - started;
            this.absorbCookies(res.headers['set-cookie']);
            const raw = Buffer.concat(chunks).toString('utf8');
            let body: unknown = raw;
            if ((res.headers['content-type'] ?? '').includes('json') && raw.length > 0) {
              try {
                body = JSON.parse(raw);
              } catch {
                body = raw;
              }
            }
            const status = res.statusCode ?? 0;
            this.recorder.record(
              opts.label,
              ms,
              status,
              Buffer.byteLength(raw) + (payload?.length ?? 0),
            );
            resolve({ status, body: body as T, raw, headers: res.headers, ms });
          });
          res.on('error', (err) => {
            const ms = performance.now() - started;
            this.recorder.recordNetworkFailure(opts.label, ms);
            reject(new NetworkFailure(err.message, ms));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`timeout after ${this.timeoutMs}ms`)));
      req.on('error', (err) => {
        const ms = performance.now() - started;
        this.recorder.recordNetworkFailure(opts.label, ms);
        reject(new NetworkFailure(err.message, ms));
      });
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }

  private absorbCookies(setCookie: string[] | undefined): void {
    for (const header of setCookie ?? []) {
      const [pair] = header.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

/** Plain GET of an absolute URL (signed media URLs point at object storage, not the API). */
export function fetchAbsolute(
  url: string,
  agent: http.Agent,
  recorder: Recorder,
  label: string,
  rewriteHost?: { address: string; port: number },
): Promise<number> {
  const parsed = new URL(url);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: rewriteHost?.address ?? parsed.hostname,
        port: rewriteHost?.port ?? Number(parsed.port || 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        // Signed URLs are host-bound (SigV4 signs the Host header).
        headers: { host: parsed.host },
        agent,
        timeout: 60_000,
      },
      (res) => {
        let bytes = 0;
        res.on('data', (c: Buffer) => (bytes += c.length));
        res.on('end', () => {
          recorder.record(label, performance.now() - started, res.statusCode ?? 0, bytes);
          resolve(bytes);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('media timeout')));
    req.on('error', (err) => {
      recorder.recordNetworkFailure(label, performance.now() - started);
      reject(err);
    });
    req.end();
  });
}
