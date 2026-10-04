import { expect, test, type Page } from '@playwright/test';
import { adminUrl, expectNoAxeViolations, fixture, settle } from './support';
import { currentStep, totp } from './totp';

/**
 * F20 (carried from B20) — Software Admin two-step sign-in, end to end in a
 * real browser with `PLATFORM_MFA_REQUIRED=true`: the enrolment gate, QR
 * enrolment, recovery codes, the TOTP sign-in step and recovery-code
 * sign-in. The TOTP is computed here exactly as an authenticator app would.
 * Also scans the Software Admin workspace with axe (DoD 1) once enrolled.
 */

test.describe.configure({ mode: 'serial' });

let secret = '';
let recoveryCodes: string[] = [];
let lastStep = 0;

/** The next TOTP step the server will accept: after the last one used
 * (replay protection) and within its ±1 window of now — waits if needed. */
async function nextStep(page: Page): Promise<number> {
  const step = lastStep + 1;
  while (step > currentStep() + 1) await page.waitForTimeout(1_000);
  lastStep = Math.max(step, currentStep() - 1);
  return lastStep;
}

async function passwordStep(page: Page): Promise<void> {
  await page.goto(adminUrl('/admin/login'));
  await page.getByLabel('Email').fill(fixture().users.softwareAdminEmail);
  await page.getByLabel('Password').fill(fixture().password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('an unenrolled Software Admin meets the enrolment gate and enrols', async ({ page }) => {
  await passwordStep(page);
  await expect(
    page.getByRole('heading', { name: 'Set up two-step sign-in to continue' }),
  ).toBeVisible();
  await expectNoAxeViolations(page, 'MFA enrolment gate');

  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByRole('img', { name: 'Authenticator setup QR code' })).toBeVisible();
  secret = (await page.locator('main code').first().innerText()).replace(/\s+/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expectNoAxeViolations(page, 'MFA enrolment (QR step)');

  // A wrong code is refused with a clear message.
  await page.getByLabel('Enter the 6-digit code it shows').fill('000000');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('did not match');

  lastStep = currentStep();
  await page.getByLabel('Enter the 6-digit code it shows').fill(totp(secret, lastStep));
  await page.getByRole('button', { name: 'Confirm' }).click();

  const list = page.getByRole('list', { name: 'Recovery codes' });
  await expect(list).toBeVisible();
  recoveryCodes = await list.getByRole('listitem').allInnerTexts();
  expect(recoveryCodes.length).toBeGreaterThanOrEqual(8);
  await expectNoAxeViolations(page, 'MFA recovery codes');

  const finish = page.getByRole('button', { name: 'Finish' });
  await expect(finish).toBeDisabled();
  await page.getByLabel('I have saved these codes').check();
  await finish.click();
  // The gate lifts: the platform shell renders.
  await expect(page.getByRole('navigation').first()).toBeVisible();
});

test('sign-in now asks for the authenticator code; a replayed code is refused', async ({
  page,
}) => {
  await passwordStep(page);
  const code = page.getByLabel('Authentication code');
  await expect(code).toBeVisible();
  await expectNoAxeViolations(page, 'MFA sign-in step');

  // The enrolment code's step is spent (replay protection, B20).
  await code.fill(totp(secret, lastStep));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();

  await code.fill(totp(secret, await nextStep(page)));
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'));
  await expect(page.getByRole('navigation').first()).toBeVisible();
});

test('a recovery code signs in once', async ({ page }) => {
  await passwordStep(page);
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(recoveryCodes[0]!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'));

  await page.context().clearCookies();
  await passwordStep(page);
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill(recoveryCodes[0]!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
});

test('Software Admin workspace passes the axe scan', async ({ page }) => {
  await passwordStep(page);
  await page.getByLabel('Authentication code').fill(totp(secret, await nextStep(page)));
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'));
  for (const pathname of [
    '/admin',
    '/admin/schools',
    '/admin/schools/new',
    '/admin/subscriptions',
    '/admin/audit',
    '/admin/analytics',
    '/admin/security',
  ]) {
    await page.goto(adminUrl(pathname));
    await settle(page);
    await expectNoAxeViolations(page, pathname);
  }
});
