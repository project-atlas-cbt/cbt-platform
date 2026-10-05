import { expect, test } from '@playwright/test';
import {
  STUDENT,
  expectNoAxeViolations,
  fixture,
  openPreview,
  schoolUrl,
  settle,
  signIn,
  startExam,
} from './support';

/**
 * F20 DoD 1 — automated WCAG 2.1/2.2 AA scan (axe-core) of every role's
 * workspace, the exam runtime and the print views. Software Admin pages are
 * scanned in `mfa.spec.ts`, after enrolment (the gate stands in front of
 * them). A clean axe run is necessary, not sufficient: the manual NVDA pass
 * and keyboard walk-through are recorded in the F20 roadmap section.
 */

const STAFF: { role: string; user: () => string; pages: string[] }[] = [
  {
    role: 'School Admin',
    user: () => fixture().users.schoolAdmin,
    pages: [
      '/school',
      '/school/people/students',
      '/school/academics/classes',
      '/school/exams',
      '/school/exam-operations',
      '/school/questions',
      '/school/results',
      '/school/analytics',
      '/school/reports',
      '/school/settings',
      '/school/help',
      '/school/help/rollover',
    ],
  },
  {
    role: 'Moderator',
    user: () => fixture().users.moderator,
    pages: [
      '/moderator',
      '/moderator/people/teachers',
      '/moderator/exams',
      '/moderator/results',
      '/moderator/help',
    ],
  },
  {
    role: 'HOD',
    user: () => fixture().users.hod,
    pages: [
      '/hod',
      '/hod/question-review',
      '/hod/question-bank',
      '/hod/exams',
      '/hod/exam-control',
      '/hod/department-analytics',
      '/hod/help',
      '/hod/help/review-questions',
    ],
  },
  {
    role: 'Teacher',
    user: () => fixture().users.teacher,
    pages: [
      '/teacher',
      '/teacher/question-bank',
      '/teacher/question-bank/new',
      '/teacher/exams',
      '/teacher/exams/new',
      '/teacher/exam-control',
      '/teacher/results',
      '/teacher/reports',
      '/teacher/help',
      '/teacher/help/build-an-exam',
    ],
  },
];

test('sign-in page', async ({ page }) => {
  await page.goto(schoolUrl('/login'));
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expectNoAxeViolations(page, '/login');
});

for (const { role, user, pages } of STAFF) {
  test(`${role} workspace`, async ({ page }) => {
    await signIn(page, user());
    for (const pathname of pages) {
      await page.goto(schoolUrl(pathname));
      await settle(page);
      await expectNoAxeViolations(page, `${role} ${pathname}`);
    }
  });
}

test('Teacher exam control centre and its print views', async ({ page }) => {
  await signIn(page, fixture().users.teacher);
  const { examId } = fixture();
  for (const pathname of [
    `/teacher/exam-control/${examId}`,
    `/teacher/exam-control/${examId}/students`,
    `/teacher/exams/${examId}`,
    `/teacher/results/${examId}`,
    `/print/exams/${examId}/results`,
    `/print/exams/${examId}/performance`,
  ]) {
    await page.goto(schoolUrl(pathname));
    await settle(page);
    await expectNoAxeViolations(page, pathname);
  }
});

test('Student home, preview, exam runtime and submit dialog', async ({ page }) => {
  await signIn(page, fixture().students[STUDENT.a11yPreview]!);
  for (const pathname of ['/student', '/student/results', '/student/profile']) {
    await page.goto(schoolUrl(pathname));
    await settle(page);
    await expectNoAxeViolations(page, pathname);
  }

  await openPreview(page);
  await settle(page);
  await expectNoAxeViolations(page, 'assessment preview');

  await startExam(page);
  await expectNoAxeViolations(page, 'exam runtime');

  // The selection is read back from IndexedDB, so it lands a tick later.
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expectNoAxeViolations(page, 'exam runtime (answered)');

  await page
    .getByRole('button', { name: /^submit/i })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoAxeViolations(page, 'submit confirmation');
});

test('accommodated student: larger text keeps the runtime within the viewport', async ({
  page,
}) => {
  await signIn(page, fixture().accommodatedStudent);
  await openPreview(page);
  await expect(page.getByText(/extra time/i).first()).toBeVisible();
  await startExam(page);
  await expectNoAxeViolations(page, 'exam runtime (larger text)');
  // Reflow at the lab baseline: no horizontal scrolling with larger text.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
