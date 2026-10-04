import { expect, test, type Page } from '@playwright/test';
import {
  STUDENT,
  answerEveryQuestion,
  fixture,
  openPreview,
  schoolUrl,
  signIn,
  startExam,
  submit,
  watchAnswerAcks,
} from './support';

/**
 * F20 DoD 8 (and the B21 → F20 client requirements) — behaviour on a poor
 * network: the client honours `503 Retry-After` from B21's load shedding,
 * answers survive latency, packet loss and a full disconnect, and the
 * student is told what is happening without being blocked from answering.
 */

const SHED_BODY = JSON.stringify({
  error: {
    code: 'SERVICE_UNAVAILABLE',
    message:
      'This is temporarily unavailable while examinations are under heavy load. Please try again shortly.',
    retryable: true,
    correlationId: '00000000-0000-7000-8000-000000000000',
  },
});

function shed(retryAfterSeconds: number) {
  return {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(retryAfterSeconds),
      'access-control-allow-origin': schoolUrl('').replace(/\/$/, ''),
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'Retry-After',
    },
    body: SHED_BODY,
  };
}

function gaps(times: number[]): number[] {
  return times.slice(1).map((t, i) => t - times[i]!);
}

test('a shed read waits out Retry-After, shows a calm state, and recovers', async ({ page }) => {
  await signIn(page, fixture().students[STUDENT.shed]!);
  const hits: number[] = [];
  let shedding = true;
  await page.context().route('**/v1/student/results**', async (route) => {
    if (!shedding) return route.continue();
    hits.push(Date.now());
    return route.fulfill(shed(2));
  });

  await page.goto(schoolUrl('/student/results'));
  const calm = page.getByRole('status').filter({ hasText: 'Temporarily unavailable' });
  await expect(calm).toBeVisible({ timeout: 30_000 });
  // First request + MAX_QUERY_RETRIES, each at least Retry-After apart.
  expect(hits).toHaveLength(3);
  for (const gap of gaps(hits)) expect(gap).toBeGreaterThanOrEqual(2_000);
  // The manual retry is held until Retry-After has passed — no click loop.
  await expect(calm.getByRole('button', { name: /try again in \d+ s/i })).toBeDisabled();

  shedding = false;
  const retry = calm.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeEnabled({ timeout: 10_000 });
  await retry.click();
  await expect(calm).toBeHidden();
  expect(hits).toHaveLength(3);
});

/**
 * A timeline of every answer-save request (sent ids, then 200 / status /
 * network failure), attached to a failure so a CI-only failure explains
 * itself — the report artifact is not always reachable.
 */
function watchAnswerTimeline(page: Page): string[] {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const log: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/answers/batch')) return;
    const ids =
      (request.postDataJSON() as { answers?: { examQuestionId: string }[] } | null)?.answers?.map(
        (a) => a.examQuestionId.slice(-4),
      ) ?? [];
    log.push(`${at()} sent [${ids.join(',')}]`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/answers/batch'))
      log.push(`${at()} failed ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/answers/batch')) log.push(`${at()} HTTP ${response.status()}`);
  });
  return log;
}

test('answer saves back off on 503 Retry-After instead of retrying at once', async ({ page }) => {
  await signIn(page, fixture().students[STUDENT.burst]!);
  await openPreview(page);
  await startExam(page);

  const hits: number[] = [];
  let refusals = 2;
  await page.context().route('**/answers/batch', async (route) => {
    hits.push(Date.now());
    if (refusals-- > 0) return route.fulfill(shed(3));
    return route.continue();
  });
  const acked = watchAnswerAcks(page);
  await answerEveryQuestion(page);
  await expect.poll(() => acked.size, { timeout: 30_000 }).toBe(fixture().questionCount);
  // Each refusal was followed by at least Retry-After of silence (plus up to
  // 30 % jitter) — and then the engine retried by itself, without waiting
  // for the next heartbeat.
  const [first, second, third] = hits;
  for (const gap of [second! - first!, third! - second!]) {
    expect(gap).toBeGreaterThanOrEqual(3_000);
    expect(gap).toBeLessThan(3_000 * 1.3 + 1_500);
  }
  await submit(page);
});

test('a congested, lossy network (Nigerian 3G profile) loses no answers', async ({ page }) => {
  await signIn(page, fixture().students[STUDENT.network]!);
  await openPreview(page);
  await startExam(page);

  // tools/load/netem's "ng-congested" shape at the browser: high RTT, low
  // throughput, and 20 % of answer saves dropped outright.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (512 * 1024) / 8,
    uploadThroughput: (256 * 1024) / 8,
  });
  let n = 0;
  await page
    .context()
    .route('**/answers/batch', (route) =>
      ++n % 5 === 0 ? route.abort('connectionreset') : route.continue(),
    );
  const acked = watchAnswerAcks(page);
  const timeline = watchAnswerTimeline(page);
  await answerEveryQuestion(page);
  try {
    await expect.poll(() => acked.size, { timeout: 60_000 }).toBe(fixture().questionCount);
  } catch (error) {
    // Built at failure time, so the whole timeline is in the message.
    throw new Error(
      `${acked.size}/${fixture().questionCount} answers acknowledged; answer-save timeline:\n  ${timeline.join('\n  ')}`,
      { cause: error },
    );
  }
  await submit(page);
  await cdp.detach();
});

test('a full disconnect: the student keeps answering, is told, and everything syncs on reconnect', async ({
  page,
  context,
}) => {
  await signIn(page, fixture().students[STUDENT.offline]!);
  await openPreview(page);
  await startExam(page);
  const acked = watchAnswerAcks(page);

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible({
    timeout: 30_000,
  });
  await answerEveryQuestion(page);
  expect(acked.size).toBe(0);

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeHidden({
    timeout: 60_000,
  });
  await expect.poll(() => acked.size, { timeout: 60_000 }).toBe(fixture().questionCount);
  // Reconnecting never reloads the page: the student is still where they
  // were (the last question), not thrown back to question 1.
  await expect(
    page.getByRole('heading', { name: new RegExp(`question ${fixture().questionCount} of`, 'i') }),
  ).toBeVisible();
  await submit(page);
});
