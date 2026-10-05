import { expect, test } from '@playwright/test';
import {
  STUDENT,
  WEB_PORT,
  answerEveryQuestion,
  fixture,
  openPreview,
  schoolUrl,
  signIn,
  startExam,
  submit,
} from './support';

/**
 * F16 flows, end to end (launch checklist 5.2): the teacher closes the
 * session and ends the examination, confirming the absentee list; makeup
 * access goes to one absent student; the student sits the makeup; the
 * original absence stays on record beside the makeup attempt.
 *
 * Uses the fixture's second exam (`makeupExamId`), so the open exam the
 * other suites share is never ended.
 */

test('ending an examination records absences, and makeup access lets a student sit it', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const { makeupExamId, users } = fixture();
  const studentId = fixture().students[STUDENT.makeup]!;
  // Provisioned students are named "Student L<n>"; the table shows that name.
  const studentName = new RegExp(`^Student L(\\d+-)?${STUDENT.makeup}$`);

  await signIn(page, users.teacher);
  await page.goto(schoolUrl(`/teacher/exam-control/${makeupExamId}`));

  // Close the open session first: ending is refused while one is open.
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const closeDialog = page.getByRole('dialog');
  await closeDialog.getByRole('button', { name: 'Close session' }).click();
  await expect(closeDialog).toBeHidden();

  // End the examination: the dialog lists every student who never started.
  await page.getByRole('button', { name: 'End examination' }).click();
  const endDialog = page.getByRole('dialog', { name: 'End this examination?' });
  await expect(endDialog.getByText(`(${studentId})`)).toBeVisible();
  await endDialog.getByRole('button', { name: 'End examination' }).click();
  await expect(endDialog).toBeHidden();

  // Makeup access for the one student.
  await page.goto(schoolUrl(`/teacher/exam-control/${makeupExamId}/makeup`));
  const row = page.getByRole('row').filter({ has: page.getByText(studentName) });
  await expect(row.getByText('Absent').first()).toBeVisible();
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Grant makeup access (1)' }).click();
  const grant = page.getByRole('dialog');
  await grant.getByLabel('Reason').fill('Unwell on the day; school nurse note on file.');
  await grant.getByRole('button', { name: 'Grant makeup access' }).click();
  await expect(grant).toBeHidden();

  // The student sits the makeup in their own browser.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await signIn(student, studentId);
  await openPreview(student, WEB_PORT, makeupExamId);
  await startExam(student);
  await answerEveryQuestion(student);
  await submit(student);
  await studentContext.close();

  // The record keeps both: the original absence and the makeup attendance.
  await page.goto(schoolUrl(`/teacher/exam-control/${makeupExamId}/participation`));
  const history = page.getByRole('row').filter({ has: page.getByText(studentName) });
  await expect(history.getByText('Absent')).toBeVisible();
  await expect(history.getByText('Attended').first()).toBeVisible();
});
