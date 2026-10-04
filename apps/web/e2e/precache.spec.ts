import { expect, test, type Page } from '@playwright/test';
import { STUDENT, fixture, openPreview, schoolUrl, signIn, startExam } from './support';

/**
 * F20 DoD 7 and the B21 → F20 media pre-cache (ADR-0021 amendment): paper
 * media downloads encrypted during the preview, Start then needs no media
 * request, and with the network cut every question's media still renders
 * from this computer. A second sitting on the same computer loads the app
 * from the service worker's precache. Also guards the service worker's API
 * bypass (no API response is ever served from a cache).
 */

async function everyImageDecoded(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main img')].every(
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    ),
  );
}

test('media is ready before Start; the exam then needs no network for it', async ({
  page,
  context,
}) => {
  const { questionCount } = fixture();
  await signIn(page, fixture().students[STUDENT.precache]!);

  const plaintextMediaFetches: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('X-Amz-Signature') && !url.includes('/precache/'))
      plaintextMediaFetches.push(url);
  });

  await openPreview(page);
  await expect(page.getByText('Exam materials are ready on this computer.')).toBeVisible({
    timeout: 60_000,
  });
  await startExam(page);

  // Walk the paper — every image renders, none fetched in clear.
  for (let n = 1; n <= questionCount; n += 1) {
    await expect(page.locator('main img').first()).toBeVisible();
    await expect.poll(() => everyImageDecoded(page)).toBe(true);
    if (n < questionCount) await page.getByRole('button', { name: 'Next' }).click();
  }
  expect(plaintextMediaFetches).toEqual([]);

  // Cut the network: every question's media still renders, from this
  // computer (the attempt runs from IndexedDB; F13).
  await context.setOffline(true);
  for (let n = 1; n <= questionCount; n += 1) {
    await page
      .getByRole('navigation', { name: 'Question navigator' })
      .getByRole('button', { name: new RegExp(`^Question ${n},`) })
      .click();
    await expect(
      page.getByRole('heading', { name: new RegExp(`question ${n} of`, 'i') }),
    ).toBeVisible();
    await expect(page.locator('main img').first()).toBeVisible();
    await expect.poll(() => everyImageDecoded(page)).toBe(true);
  }
  await context.setOffline(false);
});

test('DoD 7 — a second sitting on the same computer loads the app from cache', async ({
  browser,
}) => {
  // One browser profile = one lab computer: the first sitting installs the
  // service worker and its precache; the second must not re-download it.
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto(schoolUrl('/login'));
  await first.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  // Precache install finishes in the background; wait for the static chunks.
  await expect
    .poll(
      () =>
        first.evaluate(async () => {
          let n = 0;
          for (const name of await caches.keys()) {
            if (!name.startsWith('serwist-precache')) continue;
            n += (await (await caches.open(name)).keys()).length;
          }
          return n;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(50);
  await first.close();

  const second = await context.newPage();
  const statics: { url: string; fromCache: boolean }[] = [];
  second.on('response', (response) => {
    if (response.url().includes('/_next/static/')) {
      statics.push({ url: response.url(), fromCache: response.fromServiceWorker() });
    }
  });
  await second.goto(schoolUrl('/login'));
  await expect(second.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(statics.length).toBeGreaterThan(0);
  expect(statics.filter((s) => !s.fromCache)).toEqual([]);
  await context.close();
});

test('API responses are never served from a service-worker cache', async ({ page }) => {
  await signIn(page, fixture().students[STUDENT.precache]!);
  const fromWorker: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes(':3001/v1/') && response.fromServiceWorker()) {
      fromWorker.push(response.url());
    }
  });
  await page.goto(page.url());
  await page.waitForLoadState('networkidle');
  expect(fromWorker).toEqual([]);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).not.toContain('cross-origin');
});
