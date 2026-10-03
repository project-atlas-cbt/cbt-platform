import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client, type Target } from './http.js';
import { prepareExam, type PreparedExam } from './exam.js';
import { BUDGETS, Recorder, answerSuccessRate, checkLatency, type BudgetCheck } from './metrics.js';
import {
  Sampler,
  awaitResults,
  resetStatements,
  tableSizes,
  topStatements,
  verifyExam,
  type VerifyResult,
} from './observe.js';
import { ensureSchoolActive, type Manifest, type ProvisionedSchool } from './provision.js';
import { environment, type RunReport } from './report.js';
import { VirtualStudent } from './student.js';

export interface CommonOptions {
  manifest: Manifest;
  target: Target[];
  heartbeatMs: number;
  answerIntervalMs: number;
  mediaHost?: { address: string; port: number } | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over `items` with at most `limit` in flight. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

interface Seat {
  school: ProvisionedSchool;
  exam: PreparedExam;
  identifier: string;
  /** Labs of 40 behind one NAT address (R-09). */
  sourceIp: string;
}

/** Spreads `n` students across the manifest's schools, one fresh exam per school. */
async function seat(
  o: CommonOptions,
  n: number,
  recorder: Recorder,
  durationSeconds: number,
): Promise<{ seats: Seat[]; exams: PreparedExam[] }> {
  const schools = o.manifest.schools;
  const perSchool = Math.ceil(n / schools.length);
  const exams: PreparedExam[] = [];
  const seats: Seat[] = [];
  for (const school of schools) {
    const take = Math.min(perSchool, n - seats.length, school.students.length);
    if (take <= 0) break;
    await ensureSchoolActive(school.schoolId);
    const exam = await prepareExam(
      o.manifest,
      school,
      o.target[school.index % o.target.length]!,
      recorder,
      {
        durationSeconds,
        randomize: true,
      },
    );
    exams.push(exam);
    for (let i = 0; i < take; i++) {
      const lab = Math.floor(i / 40);
      seats.push({
        school,
        exam,
        identifier: school.students[i]!.identifier,
        sourceIp: `10.${100 + (school.index % 150)}.${lab % 250}.10`,
      });
    }
  }
  if (seats.length < n)
    throw new Error(`manifest has only ${seats.length} students; ${n} requested`);
  return { seats, exams };
}

function student(o: CommonOptions, s: Seat, i: number, recorder: Recorder): VirtualStudent {
  return new VirtualStudent({
    target: o.target[i % o.target.length]!,
    host: s.school.host,
    sourceIp: s.sourceIp,
    identifier: s.identifier,
    password: o.manifest.password,
    examId: s.exam.examId,
    recorder,
    heartbeatMs: o.heartbeatMs,
    answerIntervalMs: o.answerIntervalMs,
    mediaHost: o.mediaHost,
  });
}

function ackMap(students: VirtualStudent[]) {
  const map = new Map<string, Map<string, { selectedOptionId: string; sequenceNumber: number }>>();
  for (const s of students) if (s.attemptId) map.set(s.attemptId, s.acked);
  return map;
}

function correctnessChecks(
  verification: VerifyResult[],
  expectedPerExam: Map<string, number>,
  opts: { results: boolean },
): BudgetCheck[] {
  const checks: BudgetCheck[] = [];
  const total = (f: (v: VerifyResult) => number) => verification.reduce((s, v) => s + f(v), 0);
  const expected = [...expectedPerExam.values()].reduce((a, b) => a + b, 0);
  checks.push({
    name: 'attempts created',
    actual: String(total((v) => v.attempts)),
    budget: `exactly ${expected}`,
    pass: total((v) => v.attempts) === expected,
  });
  checks.push({
    name: 'duplicate attempts',
    actual: String(total((v) => v.duplicateActive)),
    budget: '0',
    pass: total((v) => v.duplicateActive) === 0,
  });
  if (opts.results) {
    checks.push({
      name: 'results produced',
      actual: String(total((v) => v.resultsFinal)),
      budget: `exactly ${expected}`,
      pass: total((v) => v.resultsFinal) === expected && total((v) => v.results) === expected,
    });
  }
  checks.push({
    name: 'acknowledged answers lost',
    actual: `${total((v) => v.answersMismatched)} of ${total((v) => v.answersChecked)}`,
    budget: '0',
    pass: total((v) => v.answersMismatched) === 0,
  });
  return checks;
}

/** Under a simulated network profile (tools/load/netem) every request also
 * carries the simulated RTT, while the agreed answer-save budgets are
 * server-side on a clean network — so latency is reported, not judged. */
function shapedNetwork(): boolean {
  const profile = process.env.LOAD_NETWORK_PROFILE ?? '';
  return profile !== '' && !profile.startsWith('clean');
}

function answerSuccessOnly(recorder: Recorder): BudgetCheck[] {
  return answerChecks(recorder).filter((c) => c.name === 'answer save success');
}

function answerChecks(recorder: Recorder): BudgetCheck[] {
  const s = recorder.stats('answer.batch');
  const checks = checkLatency('answer save', s, BUDGETS.answerSave);
  const rate = s ? answerSuccessRate(s) : 0;
  checks.push({
    name: 'answer save success',
    actual: `${(rate * 100).toFixed(3)}%`,
    budget: `≥ ${BUDGETS.answerSave.successMin * 100}%`,
    pass: rate >= BUDGETS.answerSave.successMin,
  });
  return checks;
}

async function measureGrowthBefore() {
  return tableSizes();
}

// -------------------------------------------------------------------------
// Sustained exam load at one concurrency level
// -------------------------------------------------------------------------

export interface LevelOptions extends CommonOptions {
  level: number;
  rampSeconds: number;
  sustainSeconds: number;
  submitSpreadSeconds: number;
  markingTimeoutMs: number;
  /** Control Center streams held open during the run (R-04). */
  sseClients: number;
  /** Staff sessions flooding reporting endpoints during the run (R-12 shed test). */
  reportingFlood: number;
  windowSeries: boolean;
  scenario: string;
}

export async function runLevel(o: LevelOptions): Promise<RunReport> {
  const recorder = new Recorder(
    o.windowSeries ? new Set(['answer.batch', 'attempt.heartbeat']) : new Set(),
  );
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const notes: string[] = [];
  const duration = o.rampSeconds + o.sustainSeconds + o.submitSpreadSeconds + 900;
  // Before seating, so opening the sessions (participant rows) counts too.
  const before = await measureGrowthBefore();
  const { seats, exams } = await seat(o, o.level, recorder, duration);
  const statements = await resetStatements();
  if (!statements)
    notes.push(
      'pg_stat_statements not available — run with the load compose override for statement-level evidence.',
    );
  const sampler = new Sampler();
  await sampler.start();

  const students = seats.map((s, i) => student(o, s, i, recorder));
  const startFailures: string[] = [];

  // Background actors.
  const stopBackground = new AbortController();
  const sse =
    o.sseClients > 0
      ? openStreams(o, exams, o.sseClients, recorder, stopBackground.signal)
      : undefined;
  const flood =
    o.reportingFlood > 0
      ? reportingFlood(o, exams, o.reportingFlood, recorder, stopBackground.signal)
      : undefined;

  // Ramp: arrivals uniformly spread over the ramp window.
  const rampStart = performance.now();
  const rampMs = o.rampSeconds * 1000;
  await Promise.all(
    students.map(async (st, i) => {
      await sleep((i / students.length) * rampMs + Math.random() * 250);
      try {
        await st.signIn();
        await st.start({ fetchMedia: o.manifest.mediaKb > 0 });
        st.run();
      } catch (err) {
        startFailures.push((err as Error).message);
      }
    }),
  );
  const rampDone = performance.now();
  console.log(
    `[${o.scenario}] level ${o.level}: ramp done in ${((rampDone - rampStart) / 1000).toFixed(0)}s (exam setup ${((rampStart - t0) / 1000).toFixed(0)}s), ${startFailures.length} start failures; sustaining ${o.sustainSeconds}s`,
  );
  // Occasional integrity signals (ADR-0020), off the critical path.
  const eventTimer = setInterval(
    () => {
      const st = students[Math.floor(Math.random() * students.length)];
      void st?.event('TAB_HIDDEN');
    },
    Math.max(200, 60_000 / Math.max(1, o.level)),
  );
  await sleep(o.sustainSeconds * 1000);
  clearInterval(eventTimer);

  // Submit: spread like a real bell, then every student polls its result.
  const submitStatuses = await Promise.all(
    students.map(async (st) => {
      if (!st.attemptId) return 0;
      await sleep(Math.random() * o.submitSpreadSeconds * 1000);
      try {
        return await st.submit();
      } catch {
        return 0;
      }
    }),
  );
  const submitted = submitStatuses.filter((s) => s === 200).length;
  const markingStart = performance.now();
  const resultWaits = await Promise.all(
    students.filter((s) => s.attemptId).map((st) => st.awaitMarking(5_000, o.markingTimeoutMs)),
  );
  const markingDrainMs = performance.now() - markingStart;
  stopBackground.abort();
  const sseSummary = sse ? await sse : undefined;
  const floodSummary = flood ? await flood : undefined;

  const expectedPerExam = new Map<string, number>();
  for (const s of seats)
    expectedPerExam.set(s.exam.examId, (expectedPerExam.get(s.exam.examId) ?? 0) + 1);
  for (const exam of exams)
    await awaitResults(exam.examId, expectedPerExam.get(exam.examId)!, 60_000);
  const verification = await Promise.all(
    exams.map((e) =>
      verifyExam(
        e.examId,
        expectedPerExam.get(e.examId)!,
        ackMap(students.filter((s) => s.client.host === e.school.host)),
      ),
    ),
  );
  const samplerSummary = await sampler.stop();
  const after = await tableSizes();
  const top = await topStatements();
  for (const st of students) st.close();
  for (const e of exams) e.teacher.close();

  const checks: BudgetCheck[] = [
    {
      name: 'starts failed',
      actual: String(startFailures.length),
      budget: '0',
      pass: startFailures.length === 0,
    },
    ...answerChecks(recorder),
    ...checkLatency('start', recorder.stats('attempt.start'), BUDGETS.start),
    ...checkLatency('submit', recorder.stats('attempt.submit'), BUDGETS.submit),
    {
      name: 'submits accepted',
      actual: `${submitted}/${seats.length}`,
      budget: `${seats.length}`,
      pass: submitted === seats.length,
    },
    ...correctnessChecks(verification, expectedPerExam, { results: true }),
  ];
  if (startFailures.length)
    notes.push(`First start failures: ${[...new Set(startFailures)].slice(0, 5).join(' | ')}`);
  const errors = students.flatMap((s) => s.errors);
  if (errors.length)
    notes.push(
      `Client-side sync errors (${errors.length}): ${[...new Set(errors)].slice(0, 6).join(' | ')}`,
    );
  const marked = resultWaits.filter((w) => w !== undefined).length;

  return {
    scenario: o.scenario,
    title: `B21 ${o.scenario}: ${o.level} concurrent attempts`,
    startedAt,
    durationSeconds: Math.round((performance.now() - t0) / 1000),
    environment: environment(),
    parameters: {
      level: o.level,
      schools: exams.length,
      questions: o.manifest.questionCount,
      mediaKbPerQuestion: o.manifest.mediaKb,
      rampSeconds: o.rampSeconds,
      sustainSeconds: o.sustainSeconds,
      submitSpreadSeconds: o.submitSpreadSeconds,
      answerIntervalMs: o.answerIntervalMs,
      heartbeatMs: o.heartbeatMs,
      apiProcesses: o.target.length,
      sseClients: o.sseClients,
      reportingFlood: o.reportingFlood,
      offeredAnswerChangesPerSecond: Math.round((o.level / (o.answerIntervalMs / 1000)) * 10) / 10,
    },
    latency: recorder.all(),
    checks,
    sampler: samplerSummary,
    statements: top,
    verification,
    growth: { before, after, attempts: seats.length },
    series: o.windowSeries
      ? Object.fromEntries(
          ['answer.batch', 'attempt.heartbeat'].map((label) => [
            label,
            recorder
              .windowSeries(label)
              .map((w) => ({ minute: w.minute, count: w.count, p95: w.p95, p99: w.p99 })),
          ]),
        )
      : undefined,
    notes,
    extra: {
      sessionOpenMs: exams.map((e) => Math.round(e.sessionOpenMs)),
      markingDrainSeconds: Math.round(markingDrainMs / 100) / 10,
      studentsSawResult: `${marked}/${resultWaits.length}`,
      ...(sseSummary ? { sse: sseSummary } : {}),
      ...(floodSummary ? { reportingFlood: floodSummary } : {}),
    },
  };
}

// -------------------------------------------------------------------------
// 500 simultaneous starts / 500 simultaneous submissions
// -------------------------------------------------------------------------

export interface BurstOptions extends CommonOptions {
  n: number;
  kind: 'start' | 'submit';
  markingTimeoutMs: number;
}

export async function runBurst(o: BurstOptions): Promise<RunReport> {
  const recorder = new Recorder();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const notes: string[] = [];
  const { seats, exams } = await seat(o, o.n, recorder, 3_600);
  await resetStatements();
  const sampler = new Sampler();
  await sampler.start();
  const students = seats.map((s, i) => student(o, s, i, recorder));

  // Preparation (not the measured burst): everyone signed in.
  const signInFailures: string[] = [];
  await pool(students, 40, async (st) => {
    try {
      await st.signIn();
    } catch (err) {
      signInFailures.push((err as Error).message);
    }
  });
  if (signInFailures.length)
    throw new Error(`sign-in failed for ${signInFailures.length}: ${signInFailures[0]}`);

  let burstMs: number;
  let statuses: number[];
  if (o.kind === 'start') {
    // Barrier, then every student fires start TWICE at once — a double
    // click / retried request. Still exactly one attempt each (X-03).
    const b0 = performance.now();
    statuses = (
      await Promise.all(
        students.flatMap((st) => [
          st.start({ fetchMedia: false }).catch(() => 0),
          st.start({ fetchMedia: false }).catch(() => 0),
        ]),
      )
    ).map((s) => (typeof s === 'number' ? s : 0));
    burstMs = performance.now() - b0;
  } else {
    await pool(students, 40, async (st) => {
      await st.start({ fetchMedia: false });
      for (let k = 0; k < 5; k++) st.answerOne();
      await st.flush();
    });
    const b0 = performance.now();
    statuses = await Promise.all(students.map((st) => st.submit().catch(() => 0)));
    burstMs = performance.now() - b0;
  }

  const expectedPerExam = new Map<string, number>();
  for (const s of seats)
    expectedPerExam.set(s.exam.examId, (expectedPerExam.get(s.exam.examId) ?? 0) + 1);
  let drainMs: number | undefined;
  if (o.kind === 'submit') {
    const d0 = performance.now();
    const waits = await Promise.all(
      exams.map((e) => awaitResults(e.examId, expectedPerExam.get(e.examId)!, o.markingTimeoutMs)),
    );
    drainMs = waits.every((w) => w !== undefined) ? performance.now() - d0 : undefined;
  }
  const verification = await Promise.all(
    exams.map((e) =>
      verifyExam(
        e.examId,
        expectedPerExam.get(e.examId)!,
        ackMap(students.filter((s) => s.client.host === e.school.host)),
      ),
    ),
  );
  const samplerSummary = await sampler.stop();
  const top = await topStatements();
  for (const st of students) st.close();
  for (const e of exams) e.teacher.close();

  const ok = statuses.filter((s) => s === 200).length;
  const expectedOk = o.kind === 'start' ? o.n * 2 : o.n;
  const label = o.kind === 'start' ? 'attempt.start' : 'attempt.submit';
  const checks: BudgetCheck[] = [
    {
      name: `${o.kind} requests answered 200`,
      actual: `${ok}/${expectedOk}`,
      budget: `${expectedOk}`,
      pass: ok === expectedOk,
    },
    {
      name: `burst wall time`,
      actual: `${(burstMs / 1000).toFixed(1)} s`,
      budget: `≤ ${BUDGETS.burstCompletionMs / 1000} s`,
      pass: burstMs <= BUDGETS.burstCompletionMs,
    },
    ...checkLatency(
      o.kind,
      recorder.stats(label),
      o.kind === 'start' ? BUDGETS.start : BUDGETS.submit,
    ),
    ...correctnessChecks(verification, expectedPerExam, { results: o.kind === 'submit' }),
  ];
  if (o.kind === 'submit') {
    checks.push({
      name: 'marking drained (all results FINAL)',
      actual: drainMs === undefined ? 'timed out' : `${(drainMs / 1000).toFixed(1)} s`,
      budget: `within ${o.markingTimeoutMs / 1000} s`,
      pass: drainMs !== undefined,
    });
  }
  return {
    scenario: `${o.kind}-burst`,
    title: `B21 ${o.n} simultaneous ${o.kind === 'start' ? 'starts (each double-fired)' : 'submissions'}`,
    startedAt,
    durationSeconds: Math.round((performance.now() - t0) / 1000),
    environment: environment(),
    parameters: {
      n: o.n,
      schools: exams.length,
      questions: o.manifest.questionCount,
      apiProcesses: o.target.length,
    },
    latency: recorder.all(),
    checks,
    sampler: samplerSummary,
    statements: top,
    verification,
    notes,
    extra: {
      burstSeconds: Math.round(burstMs / 100) / 10,
      ...(drainMs !== undefined ? { markingDrainSeconds: Math.round(drainMs / 100) / 10 } : {}),
    },
  };
}

// -------------------------------------------------------------------------
// 40-client lab burst (R-09): arrivals inside a short window behind one NAT
// -------------------------------------------------------------------------

export interface LabOptions extends CommonOptions {
  clients: number;
  arrivalWindowSeconds: number;
}

export async function runLabBurst(o: LabOptions): Promise<RunReport> {
  const recorder = new Recorder();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const { seats, exams } = await seat(
    { ...o, manifest: { ...o.manifest, schools: o.manifest.schools.slice(0, 1) } },
    o.clients,
    recorder,
    3_600,
  );
  // One lab: every client behind the same address.
  for (const s of seats) s.sourceIp = '10.99.0.10';
  const sampler = new Sampler();
  await sampler.start();
  const students = seats.map((s, i) => student(o, s, i, recorder));
  const failures: string[] = [];
  const first = performance.now();
  const perClient = await Promise.all(
    students.map(async (st, i) => {
      await sleep((i / students.length) * o.arrivalWindowSeconds * 1000);
      const arrived = performance.now();
      try {
        await st.signIn();
        await st.start({ fetchMedia: true });
        return {
          arrivedMs: arrived - first,
          readyMs: performance.now() - arrived,
          doneAtMs: performance.now() - first,
        };
      } catch (err) {
        failures.push((err as Error).message);
        return undefined;
      }
    }),
  );
  // Brief answering so the post-start sync path is exercised on the same link.
  for (const st of students) st.run();
  await sleep(30_000);
  for (const st of students) st.stop();
  await Promise.all(students.map((st) => st.flush()));
  const done = perClient.filter((x) => x !== undefined);
  const lastReady = done.reduce((m, x) => Math.max(m, x.doneAtMs), 0);
  const readyTimes = done.map((x) => x.readyMs).sort((a, b) => a - b);
  const p95 =
    readyTimes[Math.min(readyTimes.length - 1, Math.floor(readyTimes.length * 0.95))] ?? 0;
  const samplerSummary = await sampler.stop();
  for (const st of students) st.close();
  for (const e of exams) e.teacher.close();
  const media = recorder.stats('media.get');
  return {
    scenario: 'lab-burst',
    title: `B21 lab burst: ${o.clients} clients behind one link`,
    startedAt,
    durationSeconds: Math.round((performance.now() - t0) / 1000),
    environment: environment(),
    parameters: {
      clients: o.clients,
      arrivalWindowSeconds: o.arrivalWindowSeconds,
      questions: o.manifest.questionCount,
      mediaKbPerQuestion: o.manifest.mediaKb,
    },
    latency: recorder.all(),
    checks: [
      {
        name: 'clients ready (signed in, started, media cached)',
        actual: `${done.length}/${o.clients}`,
        budget: `${o.clients}`,
        pass: done.length === o.clients,
      },
      {
        name: 'whole lab ready (first arrival → last ready)',
        actual: `${(lastReady / 1000).toFixed(1)} s`,
        budget: `≤ ${BUDGETS.labBurstMs / 1000} s`,
        pass: done.length === o.clients && lastReady <= BUDGETS.labBurstMs,
      },
      ...(shapedNetwork() ? answerSuccessOnly(recorder) : answerChecks(recorder)),
    ],
    sampler: samplerSummary,
    notes: failures.length ? [`Failures: ${[...new Set(failures)].slice(0, 5).join(' | ')}`] : [],
    extra: {
      perClientReadyP95Seconds: Math.round(p95 / 100) / 10,
      perClientReadyMaxSeconds: Math.round((readyTimes.at(-1) ?? 0) / 100) / 10,
      mediaBytesTransferred: media?.bytes ?? 0,
      mediaFiles: media?.count ?? 0,
    },
  };
}

// -------------------------------------------------------------------------
// Background actors: Control Center streams and a reporting flood
// -------------------------------------------------------------------------

async function openStreams(
  o: CommonOptions,
  exams: PreparedExam[],
  count: number,
  recorder: Recorder,
  signal: AbortSignal,
) {
  const results = { opened: 0, refused: 0, frames: 0, errors: 0, reconnects: 0 };
  const conns = Array.from({ length: count }, async (_, i) => {
    const exam = exams[i % exams.length]!;
    const target = o.target[i % o.target.length]!;
    const c = new Client(
      target,
      exam.school.host,
      `10.202.${i % 250}.${Math.floor(i / 250) + 1}`,
      recorder,
      randomUUID(),
      2,
    );
    const login = await c
      .login(exam.school.teacher.identifier, o.manifest.password)
      .catch(() => undefined);
    if (login?.status !== 200) {
      results.errors += 1;
      return;
    }
    while (!signal.aborted) {
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            host: target.address,
            port: target.port,
            path: `${target.prefix}/exams/${exam.examId}/control/stream`,
            method: 'GET',
            agent: c.agent,
            headers: {
              host: exam.school.host,
              cookie: c.cookieHeader(),
              accept: 'text/event-stream',
              'x-forwarded-for': `10.202.${i % 250}.${Math.floor(i / 250) + 1}`,
            },
          },
          (res) => {
            if (res.statusCode !== 200) {
              results.refused += 1;
              res.resume();
              res.on('end', () => resolve());
              return;
            }
            results.opened += 1;
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              results.frames += (chunk.match(/\ndata:|^data:/g) ?? []).length;
            });
            res.on('end', () => resolve());
            res.on('error', () => resolve());
            signal.addEventListener('abort', () => {
              req.destroy();
              resolve();
            });
          },
        );
        req.on('error', () => {
          results.errors += 1;
          resolve();
        });
        req.end();
      });
      if (!signal.aborted) {
        results.reconnects += 1;
        await sleep(5_000); // the web client's polling fallback cadence
      }
    }
    c.close();
  });
  await Promise.all(conns);
  return results;
}

async function reportingFlood(
  o: CommonOptions,
  exams: PreparedExam[],
  sessions: number,
  recorder: Recorder,
  signal: AbortSignal,
) {
  const counts: Record<string, number> = {};
  const workers = Array.from({ length: sessions }, async (_, i) => {
    const exam = exams[i % exams.length]!;
    const school = exam.school;
    const ip = `10.203.${i % 250}.${Math.floor(i / 250) + 1}`;
    const c = new Client(
      o.target[i % o.target.length]!,
      school.host,
      ip,
      recorder,
      randomUUID(),
      2,
    );
    const login = await c
      .login(school.admin.identifier, o.manifest.password)
      .catch(() => undefined);
    if (login?.status !== 200) return;
    const paths: [string, string, string, unknown?][] = [
      ['GET', `/analytics/exams/${exam.examId}`, 'report.analytics.exam'],
      ['GET', `/analytics/exams/${exam.examId}/questions`, 'report.analytics.questions'],
      ['GET', '/analytics/school', 'report.analytics.school'],
      ['GET', `/search?q=load`, 'report.search'],
      [
        'POST',
        '/exports',
        'report.export',
        { type: 'EXAM_RESULTS', scope: { examId: exam.examId } },
      ],
    ];
    let k = i;
    while (!signal.aborted) {
      const [method, path, label, body] = paths[k++ % paths.length]!;
      const res = await c.request(method, path, { label, body }).catch(() => undefined);
      const key = `${label}:${res?.status ?? 'net'}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    c.close();
  });
  await Promise.all(workers);
  return counts;
}
