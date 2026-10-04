import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export interface Fixture {
  rootDomain: string;
  schoolHost: string;
  adminHost: string;
  password: string;
  users: {
    schoolAdmin: string;
    moderator: string;
    hod: string;
    teacher: string;
    softwareAdminEmail: string;
  };
  students: string[];
  accommodatedStudent: string;
  examId: string;
  examSessionId: string;
  questionCount: number;
}

let cached: Fixture | null = null;
export function fixture(): Fixture {
  cached ??= JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '.fixture.json'), 'utf8'),
  ) as Fixture;
  return cached;
}

export const WEB_PORT = 3000;

export function schoolUrl(pathname = '/'): string {
  return `http://${fixture().schoolHost}:${WEB_PORT}${pathname}`;
}

export function adminUrl(pathname = '/'): string {
  return `http://${fixture().adminHost}:${WEB_PORT}${pathname}`;
}

/**
 * Students are claimed by index so that suites never collide on the exam's
 * one-attempt limit. Keep this table in sync when adding a suite.
 */
export const STUDENT = {
  a11yPreview: 0,
  keyboardExam: 1,
  csp: 2,
  network: 3,
  lowEnd: 4,
  matrixChromium: 5,
  matrixFirefox: 6,
  matrixWebkit: 7,
  precache: 8,
  burst: 9,
  shed: 10,
  offline: 11,
} as const;

export async function signIn(page: Page, identifier: string): Promise<void> {
  await page.goto(schoolUrl('/login'));
  await page.getByLabel('Username or Student ID').fill(identifier);
  await page.getByLabel('Password').fill(fixture().password);
  const signIn = page.getByRole('button', { name: 'Sign in' });
  await expect(signIn).toBeEnabled();
  await signIn.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Student → preview of the fixture exam (via the real home screen link). */
export async function openPreview(page: Page): Promise<void> {
  await page.goto(schoolUrl(`/student/assessment/${fixture().examId}`));
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
}

/** From the preview: wait for pre-cache + computer check, then Start. */
export async function startExam(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: 'Start assessment' });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await page.waitForURL(/\/student\/exam\//, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /question 1 of/i })).toBeVisible({
    timeout: 60_000,
  });
}

/** Collects CSP violations reported by the page (securitypolicyviolation). */
export async function watchCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI} @ ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations ?? []);
}

/**
 * Fetches a `<school>.localhost` URL from the test process. Browsers resolve
 * `*.localhost` to loopback themselves; Node defers to the system resolver,
 * which (glibc without nss-myhostname) may not — so connect to 127.0.0.1 and
 * send the real Host header.
 */
export function fetchViaLoopback(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host, 'accept-encoding': 'identity' },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const out: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (value === undefined || key === 'content-length' || key === 'transfer-encoding')
              continue;
            out[key] = Array.isArray(value) ? value.join(', ') : value;
          }
          resolve({
            status: response.statusCode ?? 0,
            headers: out,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** Waits until the page has no loading skeletons or busy regions left. */
export async function settle(page: Page): Promise<void> {
  await page.locator('main').first().waitFor({ state: 'visible' });
  await expect(page.locator('.animate-pulse, [aria-busy="true"]')).toHaveCount(0, {
    timeout: 30_000,
  });
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * F20 DoD 1 — WCAG 2.1/2.2 AA automated scan. Fails with a readable list of
 * rule, impact and offending selectors rather than axe's raw JSON.
 */
export async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n    ${v.nodes
        .slice(0, 5)
        .map((n) => n.target.join(' '))
        .join('\n    ')}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}
