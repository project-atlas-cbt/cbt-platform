// Captures the site's product screenshots (public/screens/<kind>.png) from
// the real app, working on the fictional demo school. Run against a local
// stack (API on 3001, web on 3000, both with PLATFORM_ROOT_DOMAIN=localhost
// and PRODUCT_NAME=ExamKeep), after
//
//   PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school seed --live
//
// has run for at least two minutes (so the quiet computers show as
// disconnected), then: node scripts/capture-screens.mjs
// Each run starts one not-yet-started student's exam (STUDENT_INDEX, default 0).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../public/screens/', import.meta.url));
const state = JSON.parse(readFileSync(`${root}tools/load/.state/demo-school.json`, 'utf8'));
const o = state.oakridge;
const url = (host, path) => `http://${host}:3000${path}`;
const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE }
    : {},
);

async function as(host, identifier, fn) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(url(host, '/login'));
  const signIn = page.getByRole('button', { name: 'Sign in' });
  await signIn.waitFor();
  for (let i = 0; i < 50 && !(await signIn.isEnabled()); i++) await page.waitForTimeout(200);
  await page.getByLabel('Username or Student ID').fill(identifier);
  await page.getByLabel('Password').fill(state.password);
  await signIn.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/');
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

async function shot(page, kind) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${kind}.png` });
  console.log(`captured ${kind}: ${page.url()}`);
}

await as(o.host, o.teacher, async (page) => {
  await page.goto(url(o.host, `/teacher/exam-control/${o.liveExamId}`));
  await shot(page, 'control');
  await page.goto(url(o.host, `/teacher/results/${o.caExamId}`));
  await shot(page, 'results');
});
await as(o.host, o.hod, async (page) => {
  await page.goto(url(o.host, `/hod/question-review/${o.pendingQuestionIds[0]}`));
  await shot(page, 'review');
});
await as(state.riverside.host, state.riverside.admin, async (page) => {
  await page.goto(url(state.riverside.host, '/onboarding/2'));
  await shot(page, 'setup');
});
const waiting = o.students.filter((s) => s.state === 'not started');
await as(o.host, waiting[Number(process.env.STUDENT_INDEX ?? 0)].identifier, async (page) => {
  await page.goto(url(o.host, `/student/assessment/${o.liveExamId}`));
  const start = page.getByRole('button', { name: 'Start assessment' });
  for (let i = 0; i < 150 && !(await start.isEnabled()); i++) await page.waitForTimeout(200);
  await start.click();
  await page.getByRole('heading', { name: /question 1 of/i }).waitFor();
  for (let n = 1; n <= 4; n++) {
    await page
      .getByRole('radio')
      .nth(n % 3)
      .click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(300);
  }
  await shot(page, 'exam');
});
await browser.close();
