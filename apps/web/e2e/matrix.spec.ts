import { expect, test } from '@playwright/test';
import { STUDENT, fixture, openPreview, signIn, startExam } from './support';

/**
 * F20 DoD 4 — the browser matrix smoke (`docs/operations/browser-and-hardware-baseline.md`):
 * the student path end to end in Chromium, Firefox and WebKit. Tagged
 * `@matrix`, the only test the Firefox and WebKit projects run. The oldest
 * supported versions (Chrome/Edge 111, Firefox 115 ESR, Safari 16.4) are a
 * manual check — Playwright ships current engines only.
 */

const STUDENT_BY_BROWSER = {
  chromium: STUDENT.matrixChromium,
  firefox: STUDENT.matrixFirefox,
  webkit: STUDENT.matrixWebkit,
} as const;

test('@matrix sign in, pass the computer check, take and submit the exam', async ({
  page,
  browserName,
}) => {
  const { questionCount } = fixture();
  await signIn(page, fixture().students[STUDENT_BY_BROWSER[browserName]]!);
  await openPreview(page);
  await expect(page.getByText('This computer is ready for the exam.')).toBeVisible({
    timeout: 30_000,
  });
  await startExam(page);
  await expect(page.locator('main img').first()).toBeVisible();

  for (let n = 1; n <= questionCount; n += 1) {
    const radio = page.getByRole('radio').first();
    await radio.click();
    await expect(radio).toBeChecked();
    if (n < questionCount) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await page.waitForURL(/\/submitted/, { timeout: 60_000 });
  await expect(
    page.getByRole('heading', { name: 'Your assessment has been submitted' }),
  ).toBeVisible();
});
