import { expect, test } from '@playwright/test';
import {
  STUDENT,
  answerEveryQuestion,
  fixture,
  openPreview,
  signIn,
  startExam,
  submit,
  watchAnswerAcks,
} from './support';

/**
 * B22 (08 §25 "client crash"; DoD 1–2): a page reload mid-exam — the
 * browser crashed, or someone pressed F5 — with answers the server never
 * received. They are on this computer (IndexedDB), the exam reopens where
 * it was, and every one reaches the server; nothing is answered twice and
 * the attempt is the same attempt.
 */
test('a reload mid-exam keeps unsynced answers and syncs them once the page is back', async ({
  page,
}) => {
  await signIn(page, fixture().students[STUDENT.reload]!);
  await openPreview(page);
  await startExam(page);
  const attemptUrl = page.url();
  const acked = watchAnswerAcks(page);

  // The server never hears about these answers before the reload.
  await page.context().route('**/answers/batch', (route) => route.abort('connectionreset'));
  await answerEveryQuestion(page);
  expect(acked.size).toBe(0);

  await page.context().unroute('**/answers/batch');
  await page.reload();
  expect(page.url()).toBe(attemptUrl);
  await expect(page.getByRole('heading', { name: /question \d+ of/i })).toBeVisible({
    timeout: 60_000,
  });
  // The selection survived the reload…
  await expect(page.getByRole('radio').first()).toBeChecked();
  // …and every answer reaches the server from the restored local copy.
  await expect.poll(() => acked.size, { timeout: 60_000 }).toBe(fixture().questionCount);
  await submit(page);
});
