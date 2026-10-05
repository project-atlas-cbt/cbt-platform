import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  STUDENT,
  WEB_PORT,
  fixture,
  openPreview,
  schoolUrl,
  signIn,
  startExam,
  submit,
  watchAnswerAcks,
} from './support';

/**
 * F21 (DoD 5–6): a deployment while a student is mid-exam.
 *
 * The school's web host is a switchable proxy: first it serves the previous
 * build (a snapshot taken by `scripts/snapshot-build.mjs`), then, mid-exam,
 * the current build — what `bin/deploy.sh` does to the real web container.
 * The new service worker must install and wait; the exam must carry on, a
 * reload included; the update must apply only after submission; and once
 * it has, nothing of the previous build may remain in the precache.
 *
 * Needs `E2E_PREVIOUS_WEB_DIR` (CI's web-e2e job sets it; see e2e/README.md).
 */

const PREVIOUS_DIR = process.env.E2E_PREVIOUS_WEB_DIR;
const PROXY_PORT = 3300;
const PREVIOUS_PORT = 3101;

test.skip(!PREVIOUS_DIR, 'E2E_PREVIOUS_WEB_DIR is not set (no previous build to deploy from)');

let target = PREVIOUS_PORT;
let proxy: http.Server | undefined;
let previous: ChildProcess | undefined;

function buildId(dir: string): string {
  return readFileSync(path.join(dir, '.next/BUILD_ID'), 'utf8').trim();
}

async function waitForHttp(port: number): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      http
        .get({ host: '127.0.0.1', port, path: '/manifest.webmanifest' }, (r) => {
          r.resume();
          resolve(r.statusCode === 200);
        })
        .on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`nothing listening on ${port}`);
}

test.beforeAll(async () => {
  const dir = path.resolve(process.cwd(), PREVIOUS_DIR!);
  previous = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PREVIOUS_PORT)],
    { cwd: dir, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' },
  );
  proxy = http.createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy!.listen(PROXY_PORT, '127.0.0.1', resolve));
  await waitForHttp(PREVIOUS_PORT);
});

test.afterAll(async () => {
  previous?.kill();
  await new Promise<void>((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
});

const release = (page: Page) => page.evaluate(() => document.documentElement.dataset.release ?? '');

const workers = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      waiting: Boolean(reg?.waiting),
      installing: Boolean(reg?.installing),
    };
  });

const precachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.includes('precache')) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });

test('a deployment during an exam waits for submission, then replaces the old build', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const previousBuild = buildId(path.resolve(process.cwd(), PREVIOUS_DIR!));
  const currentBuild = buildId(process.cwd());
  expect(previousBuild, 'the two builds must differ').not.toBe(currentBuild);

  // Previous release: sign in, install the service worker, start the exam.
  await signIn(page, fixture().students[STUDENT.deployment]!, PROXY_PORT);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => (await workers(page)).controlled).toBe(true);
  const previousRelease = await release(page);
  await openPreview(page, PROXY_PORT);
  await startExam(page);
  const attemptUrl = page.url();
  const acked = watchAnswerAcks(page);
  await page.getByRole('radio').first().click();

  // Deploy: the host now serves the current build. The browser finds the
  // new worker, which installs and then waits.
  target = WEB_PORT;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await expect.poll(async () => (await workers(page)).waiting, { timeout: 60_000 }).toBe(true);

  // Another tab of the same browser, on a page that is not an exam, asks
  // the worker to take over. It must refuse while the exam is open.
  const other = await context.newPage();
  await other.goto(schoolUrl('/unsupported-browser', PROXY_PORT));
  await other.waitForTimeout(3_000);
  expect((await workers(page)).waiting).toBe(true);
  await other.close();

  // Every script the running exam page loaded is still served.
  const scripts = await page.evaluate(async () => {
    const srcs = [...document.scripts].map((s) => s.src).filter(Boolean);
    return Promise.all(srcs.map(async (src) => ({ src, status: (await fetch(src)).status })));
  });
  expect(scripts.filter((s) => s.status !== 200)).toEqual([]);

  // The exam carries on: move through it and answer.
  const { questionCount } = fixture();
  for (let n = 2; n <= questionCount; n += 1) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('heading', { name: new RegExp(`question ${n} of`, 'i') }),
    ).toBeVisible();
    await page.getByRole('radio').first().click();
  }
  await expect.poll(() => acked.size, { timeout: 60_000 }).toBe(questionCount);

  // A reload mid-exam (F5, a crash) picks up the current build's page and
  // still resumes the same attempt with its answers; the update still waits.
  await page.reload();
  expect(page.url()).toBe(attemptUrl);
  await expect(page.getByRole('heading', { name: /question 1 of/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('radio').first()).toBeChecked();
  expect(await release(page)).not.toBe(previousRelease);
  expect((await workers(page)).waiting).toBe(true);

  // Submitted: the exam is over, so the update applies.
  await submit(page);
  await expect.poll(async () => (await workers(page)).waiting, { timeout: 30_000 }).toBe(false);
  await expect(page.getByText('A new version is ready')).toBeVisible();

  // Cache-busting (DoD 6): the precache holds the current build, and
  // nothing of the previous one.
  await expect
    .poll(async () => (await precachedUrls(page)).some((u) => u.includes(currentBuild)), {
      timeout: 30_000,
    })
    .toBe(true);
  // The old entries go when the new worker finishes activating.
  await expect
    .poll(async () => (await precachedUrls(page)).filter((u) => u.includes(previousBuild)), {
      timeout: 30_000,
    })
    .toEqual([]);

  // A fresh visit runs the current build.
  await page.goto(schoolUrl('/student/assessment', PROXY_PORT));
  expect(await release(page)).not.toBe(previousRelease);
});
