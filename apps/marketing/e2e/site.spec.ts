import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  '/',
  '/features',
  '/how-it-works',
  '/exam-day-reliability',
  '/security',
  '/pricing',
  '/faq',
  '/request-a-demo',
  '/request-a-demo/sent',
  '/request-a-demo/not-sent',
  '/find-your-school',
  '/find-your-school/invalid',
  '/about',
  '/guides',
  '/guides/how-to-run-cbt-exams-in-school',
  '/guides/cbt-lab-checklist',
  '/guides/paper-exams-vs-cbt',
  '/privacy',
  '/terms',
];

for (const path of pages) {
  test.describe(path, () => {
    test('renders one heading, a title and a description, with no accessibility violations', async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.title()).not.toBe('');
      await expect(page.locator('meta[name="description"]')).toHaveCount(1);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });

    test('fits a phone screen without sideways scrolling', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('every internal link on every page resolves', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    const hrefs = await page.$$eval('a[href^="/"]', (links) =>
      links.map((a) => a.getAttribute('href')!),
    );
    for (const href of hrefs) seen.add(href.split('#')[0]!);
  }
  for (const href of seen) {
    const response = await request.get(href, { maxRedirects: 0 });
    expect(response.status(), href).toBe(200);
  }
});

test('pages carry the security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('robots and sitemap list the site', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/features');
  expect(sitemap).toContain('/guides/cbt-lab-checklist');
});

test.describe('find your school', () => {
  test('sends a school to its own sign-in page', async ({ request }) => {
    const response = await request.get('/find-your-school/go?school=Kings-College', {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toMatch(/^https?:\/\/kings-college\.[^/]+(:\d+)?\/login$/);
  });

  test('refuses anything that is not a school address', async ({ request }) => {
    for (const input of ['evil.com', 'admin', 'https://ole.evil.com', '']) {
      const response = await request.get(
        `/find-your-school/go?school=${encodeURIComponent(input)}`,
        { maxRedirects: 0 },
      );
      expect(response.status(), input).toBe(303);
      expect(response.headers().location, input).toMatch(/\/find-your-school\/invalid$/);
    }
  });
});

test.describe('request a demo', () => {
  async function fill(page: import('@playwright/test').Page) {
    await page.goto('/request-a-demo');
    await page.getByLabel('Your name').fill('Adaeze Okafor');
    await page.getByLabel('Your role').selectOption('Exam officer');
    await page.getByLabel('School name').fill('Kings College');
    await page.getByLabel('State').selectOption('Lagos');
    await page.getByLabel('Number of students').selectOption('Under 300');
    await page.getByLabel('Phone or WhatsApp number').fill('0803 123 4567');
    await page.getByLabel('Email address').fill('officer@example.com');
    await page.getByLabel(/You can contact me/).check();
  }

  test('says plainly when a request could not be sent', async ({ page }) => {
    await fill(page);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page).toHaveURL(/\/request-a-demo\/not-sent$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Your request didn’t reach us',
    );
  });

  test('requires consent before sending', async ({ page }) => {
    await fill(page);
    await page.getByLabel(/You can contact me/).uncheck();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page).toHaveURL(/\/request-a-demo$/);
  });

  test('refuses a form posted from another site', async ({ request }) => {
    const response = await request.post('/api/demo-request', {
      headers: { origin: 'https://attacker.example' },
      form: { name: 'x' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });
});
