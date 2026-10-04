import { expect, test } from '@playwright/test';
import {
  STUDENT,
  fixture,
  openPreview,
  schoolUrl,
  signIn,
  startExam,
  watchCspViolations,
} from './support';

/**
 * F20 DoD 10 — CSP and security headers applied without breaking
 * functionality (`docs/security/web-csp-policy.md`). Testing row: "CSP
 * blocks inline execution".
 */

test('every page carries the nonce CSP and the security headers', async ({ page }) => {
  const response = await page.goto(schoolUrl('/login'));
  const headers = response!.headers();
  const csp = headers['content-security-policy']!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain(`http://${fixture().schoolHost}:3001`);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  // Plain-http local stack: never HSTS (the 2026-08-27 lesson).
  expect(headers['strict-transport-security']).toBeUndefined();
});

test('the nonce changes on every request', async ({ page }) => {
  const nonce = async () =>
    /'nonce-([^']+)'/.exec(
      (await page.goto(schoolUrl('/login')))!.headers()['content-security-policy']!,
    )![1];
  expect(await nonce()).not.toBe(await nonce());
});

test('markup injected into a page cannot run script (reflected/stored XSS shape)', async ({
  page,
}) => {
  // Serve the real login page with an un-nonced inline <script> spliced into
  // its HTML, keeping the server's own CSP header — exactly what an HTML
  // injection would produce. The browser must refuse to run it.
  await page.route(schoolUrl('/login'), async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<body([^>]*)>/,
      '<body$1><script>window.__injected = true;</script>',
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto(schoolUrl('/login'));
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected),
  ).toBeUndefined();
  // …while the app's own (nonce'd) scripts still ran.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('an injected inline event handler does not execute', async ({ page }) => {
  await page.goto(schoolUrl('/login'));
  const executed = await page.evaluate(async () => {
    (window as unknown as { __clicked?: boolean }).__clicked = false;
    const div = document.createElement('div');
    div.innerHTML = '<img src="x" onerror="window.__clicked = true">';
    document.body.appendChild(div);
    await new Promise((r) => setTimeout(r, 300));
    return (window as unknown as { __clicked?: boolean }).__clicked;
  });
  expect(executed).toBe(false);
});

test('the app runs under the policy: no violations from sign-in through a running exam, the service worker registers', async ({
  page,
}) => {
  const violations = await watchCspViolations(page);
  await signIn(page, fixture().students[STUDENT.csp]!);
  expect(await violations()).toEqual([]);

  await openPreview(page);
  await startExam(page);
  // Question media from object storage rendered (img-src / connect-src).
  await expect(page.locator('main img').first()).toBeVisible();
  expect(await violations()).toEqual([]);

  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg);
  });
  expect(registered).toBe(true);
});
