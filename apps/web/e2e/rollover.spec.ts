import { expect, test } from '@playwright/test';
import { WEB_PORT, fixture, schoolUrl, signIn } from './support';

/**
 * F19 flow, end to end (launch checklist 5.2): a School Admin closes the
 * academic session after the readiness check, generates the rollover plan
 * into the next session, reviews structure and student decisions, and
 * commits the rollover.
 *
 * Runs in the fixture's second school, which has no exams, so closing its
 * session never touches the exams the other suites use.
 */

test('a School Admin closes the session and commits the rollover into the next one', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { schoolHost, schoolAdmin, sessionId, nextSessionName } = fixture().rollover;
  const url = (pathname: string) => schoolUrl(pathname, WEB_PORT, schoolHost);

  await signIn(page, schoolAdmin, WEB_PORT, schoolHost);
  await page.goto(url(`/school/academics/sessions/${sessionId}/close`));

  // Readiness: no open exams, no results still processing.
  await expect(page.getByRole('heading', { name: 'Session is ready to be closed' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Academic Session' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Close Session' }).click();
  await expect(confirm).toBeHidden();

  // Target session, then the plan.
  await page.getByRole('combobox', { name: 'Target Academic Session' }).click();
  await page.getByRole('option', { name: new RegExp(nextSessionName) }).click();
  await page.getByRole('button', { name: 'Generate Rollover Plan' }).click();
  await page.waitForURL(/\/school\/academics\/rollover\/[0-9a-f-]{36}$/);

  // Structure review, then the student decisions.
  await expect(page.getByText('Cloned Classes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Student Decisions \(\d+\)/ }).click();
  await page.waitForURL(/\/students$/);
  await expect(page.getByRole('checkbox', { name: /^Select Student/ }).first()).toBeVisible();

  // The fixture school has one level (SS2), so the proposed promotions have
  // no SS3 class to go to: override them all to repeat in the SS2 draft,
  // with the mandatory reason.
  await page.getByRole('button', { name: 'Select all visible' }).click();
  await page.getByRole('button', { name: 'Batch Override' }).click();
  const override = page.getByRole('dialog');
  await override.getByRole('combobox', { name: 'Administrative Decision Outcome' }).click();
  await page.getByRole('option', { name: /^Repeat Year/ }).click();
  await override.getByRole('combobox', { name: 'Target Class Draft' }).click();
  await page
    .getByRole('option', { name: /\(SS2 Arm / })
    .first()
    .click();
  await override
    .getByLabel('Reason for Override (Required)')
    .fill('No SS3 classes yet; the cohort repeats SS2 this session.');
  await override.getByRole('button', { name: 'Apply Decision' }).click();
  await expect(override).toBeHidden();

  // Confirm: acknowledge, type the session name, commit.
  await page.getByRole('link', { name: 'Proceed to Confirmation' }).click();
  await page.waitForURL(/\/confirm$/);
  await page.getByRole('checkbox').check();
  await page.getByLabel(/to confirm/).fill(nextSessionName);
  await page.getByRole('button', { name: 'Commit Session Rollover' }).click();
  await expect(
    page.getByRole('heading', { name: 'Academic Session Transition Complete' }),
  ).toBeVisible({ timeout: 60_000 });
});
