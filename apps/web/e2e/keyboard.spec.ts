import { expect, test, type Locator, type Page } from '@playwright/test';
import { STUDENT, fixture, schoolUrl } from './support';

/**
 * F20 DoD 2 — a full exam completed with the keyboard alone: sign-in,
 * preview, Start, answering every question, moving between questions,
 * submitting and confirming. No mouse event is dispatched anywhere in this
 * file; every step asserts where focus is, since a keyboard user can only
 * act on the focused control.
 */

/** Presses Tab until `target` holds focus (fails after `max` presses). */
async function tabTo(page: Page, target: Locator, max = 40): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`could not reach ${target.toString()} with Tab in ${max} presses`);
}

test('a student completes and submits an exam with the keyboard only', async ({ page }) => {
  const { students, password, examId, questionCount } = fixture();

  // Sign in.
  await page.goto(schoolUrl('/login'));
  await tabTo(page, page.getByLabel('Username or Student ID'));
  await page.keyboard.type(students[STUDENT.keyboardExam]!);
  await tabTo(page, page.getByLabel('Password'));
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  // Home → the assessment's preview, by its link.
  const open = page.getByRole('button', { name: 'View details' }).first();
  await expect(open).toBeVisible();
  await tabTo(page, open, 60);
  await page.keyboard.press('Enter');
  await page.waitForURL(new RegExp(`/student/assessment/${examId}`));

  const start = page.getByRole('button', { name: 'Start assessment' });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await tabTo(page, start, 60);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/student\/exam\//, { timeout: 60_000 });

  // Focus starts on the question heading; the skip link (first in the tab
  // order) brings it back there from anywhere.
  await expect(page.locator('#question-heading')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Skip to question' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#question-heading')).toBeFocused();

  for (let n = 1; n <= questionCount; n += 1) {
    await expect(
      page.getByRole('heading', { name: new RegExp(`question ${n} of`, 'i') }),
    ).toBeVisible();
    // Into the answer group: Tab focuses the group's (first) radio; Space selects.
    const radios = page.getByRole('radio');
    await tabTo(page, radios.first());
    // Vary the answer: arrow down (n-1) % options times, then Space.
    const options = await radios.count();
    for (let k = 0; k < (n - 1) % options; k += 1) {
      await page.keyboard.press('ArrowDown');
      // Radix moves roving focus on the next task; a person cannot press
      // the next key sooner, so neither does the test.
      await expect(radios.nth(k + 1)).toBeFocused();
    }
    await page.keyboard.press('Space');
    await expect(radios.nth((n - 1) % options)).toBeChecked();

    if (n < questionCount) {
      await page.keyboard.press('Alt+N');
      // Focus moves to the new question's heading (announced by readers).
      await expect(page.locator('#question-heading')).toBeFocused();
    }
  }

  // Back one question with Alt+P: the earlier answer is still there.
  await page.keyboard.press('Alt+P');
  await expect(
    page.getByRole('heading', { name: new RegExp(`question ${questionCount - 1} of`, 'i') }),
  ).toBeVisible();
  await expect(page.locator('#question-heading')).toBeFocused();
  await page.keyboard.press('Alt+N');

  // Submit → the dialog traps focus; confirm with Enter.
  const submit = page.getByRole('button', { name: 'Submit', exact: true });
  await tabTo(page, submit);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Submit your answers?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`answered all ${questionCount}`);
  await expect(dialog.locator(':focus')).toHaveCount(1);
  // Escape closes without submitting and returns focus to the trigger.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await tabTo(page, dialog.getByRole('button', { name: 'Submit', exact: true }), 6);
  await page.keyboard.press('Enter');

  await page.waitForURL(/\/submitted/, { timeout: 30_000 });
  await expect(
    page.getByRole('heading', { name: 'Your assessment has been submitted' }),
  ).toBeVisible();
});
