import http from 'node:http';
import https from 'node:https';

/**
 * B23 testing requirement "Smoke": post-deployment verification of every
 * critical path a deployment can break without a code change — TLS and
 * DNS for each host shape, readiness of every dependency, tenant
 * resolution, authentication refusal, CORS, and production security
 * headers. Read-only: it signs nobody in and writes nothing, so it is the
 * one check that runs against production too (the golden path, which
 * writes, runs on staging only).
 *
 *   SMOKE_ROOT=example.ng pnpm --filter @atlas/load smoke
 *   SMOKE_ROOT=localtest.me SMOKE_API=http://127.0.0.1:3001/v1 SMOKE_PRODUCTION=false ...
 *
 * SMOKE_API: `https://{host}/v1` by default — each request connects to the
 *   host it names; a fixed URL sends every request there with that Host.
 * SMOKE_SCHOOL: a real school's subdomain whose branding must resolve
 *   (optional; without it only the unknown-school path is checked).
 * SMOKE_WEB: `true` once the web tier is live (F21) to check it too.
 * SMOKE_PRODUCTION: `false` to skip production-only header checks (local).
 */

const root = required('SMOKE_ROOT');
const apiSpec = process.env.SMOKE_API ?? 'https://{host}/v1';
const school = process.env.SMOKE_SCHOOL;
const checkWeb = process.env.SMOKE_WEB === 'true';
const production = process.env.SMOKE_PRODUCTION !== 'false';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(
  url: URL,
  host: string,
  method = 'GET',
  headers: Record<string, string> = {},
): Promise<Reply> {
  const secure = url.protocol === 'https:';
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (secure ? 443 : 80),
        path: url.pathname + url.search,
        headers: { host, accept: 'application/json', ...headers },
        ...(secure ? { servername: host } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end();
  });
}

function api(host: string, path: string, method = 'GET', headers: Record<string, string> = {}) {
  return request(new URL(apiSpec.replace('{host}', host) + path), host, method, headers);
}

const failures: string[] = [];
async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`[smoke] ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`[smoke] ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const json = <T>(r: Reply): T => JSON.parse(r.body) as T;

const apiHost = `api.${root}`;
const platformApiHost = `admin.api.${root}`;
const schoolApiHost = (s: string) => `${s}.api.${root}`;
const unknownSchool = 'smoke-no-such-school';

await check(`liveness on ${apiHost}`, async () => {
  const r = await api(apiHost, '/health');
  expect(r.status === 200, `HTTP ${r.status}`);
});

await check('readiness: every dependency reachable', async () => {
  const r = await api(apiHost, '/health/ready');
  const body = json<{ status: string; checks: { name: string; ok: boolean }[] }>(r);
  const down = body.checks.filter((c) => !c.ok).map((c) => c.name);
  expect(r.status === 200 && down.length === 0, `HTTP ${r.status}, down: ${down.join(', ')}`);
});

if (production) {
  await check('production security headers', async () => {
    const r = await api(apiHost, '/health');
    expect(String(r.headers['strict-transport-security']).includes('max-age='), 'no HSTS');
    expect(r.headers['x-content-type-options'] === 'nosniff', 'no nosniff');
    expect(r.headers['x-frame-options'] === 'DENY', 'framable');
    expect(r.headers['x-correlation-id'], 'no correlation id');
  });
}

await check('an unknown school resolves to nothing, not an error', async () => {
  const r = await api(schoolApiHost(unknownSchool), '/tenant/resolve');
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(json<{ school: unknown }>(r).school === null, 'resolved a school that does not exist');
});

if (school) {
  await check(`school ${school} resolves on its API host`, async () => {
    const r = await api(schoolApiHost(school), '/tenant/resolve');
    const body = json<{ school: { subdomain: string } | null }>(r);
    expect(body.school?.subdomain === school, `HTTP ${r.status}, school ${body.school?.subdomain}`);
  });
}

await check('school routes refuse an anonymous caller', async () => {
  const r = await api(schoolApiHost(school ?? unknownSchool), '/auth/me');
  expect(r.status === 401, `HTTP ${r.status}`);
  expect(json<{ error: { code: string } }>(r).error.code === 'UNAUTHENTICATED', r.body);
});

await check('platform routes refuse an anonymous caller', async () => {
  const r = await api(platformApiHost, '/platform/auth/me');
  expect(r.status === 401, `HTTP ${r.status}`);
});

await check('CORS admits a school origin with credentials, refuses a foreign one', async () => {
  const origin = `https://${school ?? unknownSchool}.${root}`;
  const preflight = (o: string) =>
    api(schoolApiHost(school ?? unknownSchool), '/auth/login', 'OPTIONS', {
      origin: o,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    });
  const ours = await preflight(origin);
  expect(ours.headers['access-control-allow-origin'] === origin, 'school origin not allowed');
  expect(ours.headers['access-control-allow-credentials'] === 'true', 'credentials not allowed');
  const foreign = await preflight('https://smoke.invalid');
  expect(!foreign.headers['access-control-allow-origin'], 'foreign origin allowed');
});

if (checkWeb) {
  await check(`web tier serves ${root} with a nonce CSP`, async () => {
    const host = school ? `${school}.${root}` : root;
    const r = await request(new URL(`https://${host}/`), host, 'GET', { accept: 'text/html' });
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(/'nonce-/.test(String(r.headers['content-security-policy'])), 'no nonce CSP');
  });
}

if (failures.length > 0) {
  console.error(`[smoke] ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('[smoke] all checks passed');
