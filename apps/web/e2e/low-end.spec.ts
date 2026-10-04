import { expect, test, type Page } from '@playwright/test';
import { STUDENT, fixture, openPreview, signIn, startExam } from './support';

/**
 * F20 DoD 5 — the exam runtime on the lab-hardware profile: 1366×768
 * (the project config) and the CPU throttled 4× through the DevTools
 * protocol, approximating the low-end lab PCs B21's capacity plan assumes.
 * Budgets are on what a student feels: how long a question change takes to
 * paint, how long an answer selection takes to show, and the longest main-
 * thread task while doing both. Chromium only (CDP); real-hardware
 * validation remains a manual item in the roadmap.
 */

const CPU_SLOWDOWN = 4;
/** RAIL "response": visible feedback within 100 ms at full speed — so at
 * most ~4× that with the CPU slowed 4×. */
const SELECT_BUDGET_MS = 400;
const NAVIGATE_BUDGET_MS = 400;
const LONG_TASK_BUDGET_MS = 200;

async function startLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
}

test('question changes and answer selection stay within budget at 4× CPU slowdown', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs the Chrome DevTools protocol');
  const { questionCount } = fixture();
  await signIn(page, fixture().students[STUDENT.lowEnd]!);
  await openPreview(page);
  await startExam(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await startLongTaskObserver(page);

  // Measured inside the page — input event to the DOM reflecting it — so
  // the test runner's own polling is not counted.
  const select: number[] = [];
  const navigate: number[] = [];
  for (let n = 1; n <= questionCount; n += 1) {
    const radio = page.getByRole('radio').nth(n % 2);
    select.push(
      await radio.evaluate(
        (el) =>
          new Promise<number>((resolve) => {
            const start = performance.now();
            const observer = new MutationObserver(() => {
              if (el.getAttribute('aria-checked') !== 'true') return;
              observer.disconnect();
              resolve(performance.now() - start);
            });
            observer.observe(el, { attributes: true, attributeFilter: ['aria-checked'] });
            (el as HTMLElement).click();
          }),
      ),
    );

    if (n < questionCount) {
      const next = page.getByRole('button', { name: 'Next' });
      navigate.push(
        await next.evaluate(
          (el, target) =>
            new Promise<number>((resolve) => {
              const start = performance.now();
              const observer = new MutationObserver(() => {
                const heading = document.getElementById('question-heading');
                if (!heading?.textContent?.includes(`Question ${target} of`)) return;
                observer.disconnect();
                resolve(performance.now() - start);
              });
              observer.observe(document.body, {
                subtree: true,
                childList: true,
                characterData: true,
              });
              (el as HTMLElement).click();
            }),
          n + 1,
        ),
      );
    }
  }
  // Let a few timer ticks run under throttling too (1 Hz renders).
  await page.waitForTimeout(3_000);
  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: number[] }).__longTasks,
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();

  const report = { select, navigate, longTasks: longTasks.map(Math.round) };
  test
    .info()
    .annotations.push({ type: 'low-end timings (ms)', description: JSON.stringify(report) });
  console.log('[low-end]', JSON.stringify(report));
  expect(Math.max(...select), JSON.stringify(report)).toBeLessThanOrEqual(SELECT_BUDGET_MS);
  expect(Math.max(...navigate), JSON.stringify(report)).toBeLessThanOrEqual(NAVIGATE_BUDGET_MS);
  expect(Math.max(0, ...longTasks), JSON.stringify(report)).toBeLessThanOrEqual(
    LONG_TASK_BUDGET_MS,
  );
});
