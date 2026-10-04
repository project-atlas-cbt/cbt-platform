import { readFileSync } from 'node:fs';
import path from 'node:path';
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
