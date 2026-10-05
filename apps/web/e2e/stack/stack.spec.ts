import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * F21 (owner decision 2026-10-04: the CI stack replaces preview deployments
 * and staging). The production build behind Caddy, with production
 * configuration: pages render under the nonce CSP over https, the service
 * worker installs, and maintenance mode answers both the web and the API
 * hosts. Screenshots of each page go to `stack-preview/`, which CI uploads
 * as the pull request's preview.
 */

const ROOT = process.env.STACK_ROOT ?? 'atlas.test';
// The root domain and www serve the marketing site (ADR-0034); every
// platform page is checked on a platform host.
const WEB = `admin.${ROOT}`;
const PREVIEW_DIR = path.resolve(import.meta.dirname, '../../stack-preview');
const MAINTENANCE = path.resolve(import.meta.dirname, '../../../../infra/vps/bin/maintenance.sh');

async function preview(page: Page, name: string): Promise<void> {
  mkdirSync(PREVIEW_DIR, { recursive: true });
  await page.screenshot({ path: path.join(PREVIEW_DIR, `${name}.png`), fullPage: true });
}

async function cspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener('securitypolicyviolation', (e) => seen.push(e.violatedDirective));
  });
  return () => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

test('Software Admin sign-in renders under the nonce CSP and installs the service worker', async ({
  page,
}) => {
  const violations = await cspViolations(page);
  const response = await page.goto(`https://admin.${ROOT}/admin/login`);
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers['content-security-policy']).toMatch(/'nonce-[^']+' 'strict-dynamic'/);
  expect(headers['strict-transport-security']).toContain('max-age=');
  await expect(page.locator('html[data-app-ready]')).toHaveCount(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(await violations()).toEqual([]);
  await preview(page, 'admin-sign-in');
});

test('the admin host sends its bare root and /login to the Software Admin console', async ({
  page,
}) => {
  await page.goto(`https://${WEB}/login`);
  expect(page.url()).toBe(`https://${WEB}/admin/login`);
  await page.goto(`https://${WEB}/`);
  await expect(page).toHaveURL(`https://${WEB}/admin/login`);
});

test('error pages: 404 and unsupported browser', async ({ page }) => {
  const missing = await page.goto(`https://${WEB}/no-such-page`);
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
  await preview(page, 'not-found');

  await page.goto(`https://${WEB}/unsupported-browser`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/cannot run/);
  await preview(page, 'unsupported-browser');
});

test('maintenance mode answers the web with the maintenance page and the API with a retryable 503', async ({
  page,
}) => {
  execFileSync(MAINTENANCE, ['on']);
  try {
    const response = await page.goto(`https://${WEB}/login`);
    expect(response?.status()).toBe(503);
    expect(response?.headers()['retry-after']).toBeTruthy();
    await expect(page.getByRole('heading', { name: /briefly unavailable/ })).toBeVisible();
    await preview(page, 'maintenance');

    // As the exam client sees it: a cross-origin call it can read, retryable.
    const api = await page.evaluate(async (root) => {
      const r = await fetch(`https://api.${root}/v1/health`, { credentials: 'include' });
      return {
        status: r.status,
        body: (await r.json()) as { error: { retryable: boolean; code: string } },
      };
    }, ROOT);
    expect(api.status).toBe(503);
    expect(api.body.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  } finally {
    execFileSync(MAINTENANCE, ['off']);
  }
  const back = await page.goto(`https://${WEB}/login`);
  expect(back?.status()).toBe(200);
});

test('the root domain serves the marketing site and www redirects to it', async ({ page }) => {
  const response = await page.goto(`https://${ROOT}/`);
  expect(response?.status()).toBe(200);
  // The marketing site's static headers, not the platform's nonce CSP.
  expect(response!.headers()['content-security-policy']).not.toMatch(/'nonce-/);
  await expect(page.getByRole('link', { name: /request a demo/i }).first()).toBeVisible();
  await preview(page, 'marketing-home');

  await page.goto(`https://www.${ROOT}/pricing`);
  expect(page.url()).toBe(`https://${ROOT}/pricing`);
});
