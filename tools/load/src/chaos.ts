import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Redis } from 'ioredis';
import { BUDGETS, Recorder, answerSuccessRate, type BudgetCheck } from './metrics.js';
import { awaitResults, ownerDb, verifyExam } from './observe.js';
import { environment, type RunReport } from './report.js';
import { ackMap, correctnessChecks, pool, seat, student, type CommonOptions } from './scenarios.js';
import type { Target } from './http.js';
import type { VirtualStudent } from './student.js';

/**
 * B22 chaos harness (DoD 1–5; roadmap "Chaos: kill an API node mid-exam;
 * kill a worker mid-marking; drop Redis; drop object storage — assert no
 * attempt, answer, or result is lost or duplicated").
 *
 * It owns the processes: two API processes and the worker, started from
 * their production builds, so a fault is a real signal to a real process —
 * SIGKILL, SIGTERM, SIGSTOP (a hung node, or a network partition as the
 * caller sees it) — and Redis, object storage and Postgres are faulted the
 * same way on this host. Students fail over between API processes the way
 * a load balancer moves them off a dead node (http.ts `failover`).
 *
 * Every row is a fresh exam per school with ~200 students answering under
 * load, a fault injected and recovered, everyone submitted (or expired),
 * marking drained, and then the oracle (`integrityChecks`) run against the
 * database: exactly one attempt per student, no acknowledged answer lost,
 * every answer row backed by its accepted event, exactly one finalisation
 * audit per attempt, exactly one FINAL result per attempt with every
 * question marked and totals that add up, nothing left IN_PROGRESS, and no
 * marking job left failed.
 */

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const LOG_DIR = path.resolve(import.meta.dirname, '..', '.state', 'chaos-logs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

interface Managed {
  name: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  ready: () => Promise<boolean>;
  proc?: ChildProcess;
}

export class Supervisor {
  readonly apis: Managed[];
  readonly worker: Managed;

  constructor(readonly ports: number[]) {
    mkdirSync(LOG_DIR, { recursive: true });
    this.apis = ports.map((port) => ({
      name: `api-${port}`,
      cwd: path.join(ROOT, 'apps', 'api'),
      env: { ...process.env, API_PORT: String(port), TRUST_PROXY_HOPS: '1', LOG_LEVEL: 'warn' },
      ready: () => httpOk(port, '/v1/health'),
    }));
    this.worker = {
      name: 'worker',
      cwd: path.join(ROOT, 'apps', 'worker'),
      env: { ...process.env, LOG_LEVEL: 'warn' },
      ready: () => Promise.resolve(true),
    };
  }

  get targets(): Target[] {
    return this.ports.map((port) => ({ address: '127.0.0.1', port, prefix: '/v1' }));
  }

  async startAll(): Promise<void> {
    await Promise.all([...this.apis, this.worker].map((m) => this.start(m)));
  }

  async start(m: Managed): Promise<void> {
    const log = createWriteStream(path.join(LOG_DIR, `${m.name}.log`), { flags: 'a' });
    log.write(`\n--- start ${new Date().toISOString()} ---\n`);
    const proc = spawn(process.execPath, ['dist/main.js'], {
      cwd: m.cwd,
      env: m.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.pipe(log);
    proc.stderr?.pipe(log);
    m.proc = proc;
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      if (proc.exitCode !== null)
        throw new Error(`${m.name} exited during boot (${proc.exitCode})`);
      if (await m.ready()) return;
      await sleep(250);
    }
    throw new Error(`${m.name} not ready after 60 s`);
  }

  /** Sends `signal` and, for a terminating one, waits for the exit. */
  async signal(m: Managed, signal: NodeJS.Signals): Promise<number> {
    const proc = m.proc;
    if (!proc || proc.exitCode !== null) return 0;
    const t0 = performance.now();
    if (signal === 'SIGSTOP' || signal === 'SIGCONT') {
      proc.kill(signal);
      return 0;
    }
    const exited = new Promise<void>((r) => proc.once('exit', () => r()));
    proc.kill(signal);
    await Promise.race([exited, sleep(60_000)]);
    return performance.now() - t0;
  }

  async restart(m: Managed): Promise<void> {
    await this.start(m);
  }

  async stopAll(): Promise<void> {
    for (const m of [...this.apis, this.worker]) {
      if (m.proc && m.proc.exitCode === null) {
        m.proc.kill('SIGCONT');
        await this.signal(m, 'SIGTERM');
      }
    }
  }
}

async function httpOk(port: number, urlPath: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function pidOf(pattern: string): number {
  const out = execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().split('\n');
  const pid = Number(out[0]);
  if (!pid) throw new Error(`no process matches ${pattern}`);
  return pid;
}

/** Host services, faulted in place. */
const host = {
  redisPid: () => pidOf('redis-server'),
  storagePid: () => pidOf(process.env.CHAOS_STORAGE_PATTERN ?? 's3rver|minio server'),
  hang: (pid: number) => process.kill(pid, 'SIGSTOP'),
  resume: (pid: number) => process.kill(pid, 'SIGCONT'),
  async terminateAppBackends(): Promise<number> {
    const rows = await ownerDb().$queryRaw<{ n: bigint }[]>`
      SELECT count(pg_terminate_backend(pid)) AS n FROM pg_stat_activity
       WHERE usename = 'atlas_app' AND pid <> pg_backend_pid()`;
    return Number(rows[0]?.n ?? 0);
  },
  restartPostgres(): number {
    const t0 = performance.now();
    const cmd = (process.env.CHAOS_PG_RESTART ?? 'pg_ctlcluster 16 main restart').split(' ');
    execFileSync(cmd[0]!, cmd.slice(1), { stdio: 'ignore' });
    return performance.now() - t0;
  },
  async flushRedis(): Promise<void> {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    await redis.flushall();
    redis.disconnect();
  },
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface Ctx {
  sup: Supervisor;
  students: VirtualStudent[];
  notes: string[];
  timeline: { t: number; event: string }[];
  mark: (event: string) => void;
}

interface Row {
  id: string;
  title: string;
  /** Spec row(s) this proves: `08 §25` failure modes and B22 DoD items. */
  proves: string;
  durationSeconds?: number;
  /** Injected while students answer. */
  midExam?: (c: Ctx) => Promise<void>;
  /** Injected after everyone submitted, while marking drains. */
  duringMarking?: (c: Ctx) => Promise<void>;
  /** Injected before submit; students are submitted inside it. */
  aroundSubmit?: (c: Ctx, submitAll: () => Promise<void>) => Promise<void>;
  /** Students never submit: the exam time runs out (ADR-0004 sweeper). */
  expire?: (c: Ctx) => Promise<void>;
  markingTimeoutMs?: number;
}

export const ROWS: Row[] = [
  {
    id: 'api-kill9',
    title: 'API node killed (SIGKILL) mid-exam, restarted',
    proves: '08 §25 node crash; DoD 2',
    midExam: async (c) => {
      c.mark('SIGKILL api-0');
      await c.sup.signal(c.sup.apis[0]!, 'SIGKILL');
      await sleep(10_000);
      await c.sup.restart(c.sup.apis[0]!);
      c.mark('api-0 back');
    },
  },
  {
    id: 'api-term',
    title: 'API node drained (SIGTERM, a deploy) mid-exam, restarted',
    proves: '08 §25 node crash (graceful); DoD 2',
    midExam: async (c) => {
      c.mark('SIGTERM api-0');
      const ms = await c.sup.signal(c.sup.apis[0]!, 'SIGTERM');
      c.notes.push(`api-0 drained and exited in ${(ms / 1000).toFixed(1)} s.`);
      await c.sup.restart(c.sup.apis[0]!);
      c.mark('api-0 back');
    },
  },
  {
    id: 'api-hang',
    title: 'API node hung / partitioned (SIGSTOP 20 s) mid-exam',
    proves: '08 §25 network loss (server side); DoD 2',
    midExam: async (c) => {
      c.mark('SIGSTOP api-0');
      await c.sup.signal(c.sup.apis[0]!, 'SIGSTOP');
      await sleep(20_000);
      await c.sup.signal(c.sup.apis[0]!, 'SIGCONT');
      c.mark('SIGCONT api-0');
    },
  },
  {
    id: 'worker-kill9',
    title: 'Worker killed twice (SIGKILL) while marking drains',
    proves: '08 §25 worker crash, result-worker failure; DoD 3',
    duringMarking: async (c) => {
      for (const n of [1, 2]) {
        await sleep(300);
        c.mark(`SIGKILL worker (${n})`);
        await c.sup.signal(c.sup.worker, 'SIGKILL');
        await sleep(3_000);
        await c.sup.restart(c.sup.worker);
        c.mark('worker back');
      }
    },
  },
  {
    id: 'worker-kill-expiry',
    title: 'Exam time runs out while the worker is down (auto-submit sweeper)',
    proves: '08 §25 worker crash; ADR-0004; DoD 3',
    durationSeconds: 120,
    expire: async (c) => {
      await sleep(80_000);
      c.mark('SIGKILL worker');
      await c.sup.signal(c.sup.worker, 'SIGKILL');
      // Down across the expiry (120 s) and the 60 s grace.
      await sleep(110_000);
      for (const s of c.students) s.stop();
      await c.sup.restart(c.sup.worker);
      c.mark('worker back');
    },
    markingTimeoutMs: 300_000,
  },
  {
    id: 'redis-hang',
    title: 'Redis unresponsive (SIGSTOP 45 s) mid-exam, submissions during the outage',
    proves: '08 §25 cache outage; DoD 4',
    aroundSubmit: async (c, submitAll) => {
      const pid = host.redisPid();
      c.mark('SIGSTOP redis');
      host.hang(pid);
      const t0 = Date.now();
      await sleep(10_000);
      await submitAll();
      c.mark('submitted during outage');
      await sleep(Math.max(0, 45_000 - (Date.now() - t0)));
      host.resume(pid);
      c.mark('SIGCONT redis');
    },
    // Marking owed while Redis was down is re-enqueued by the
    // reconciliation pass (2 minutes after the result was created).
    markingTimeoutMs: 420_000,
  },
  {
    id: 'redis-data-loss',
    title: 'Redis loses its data (FLUSHALL) with marking jobs queued',
    proves: '08 §25 cache outage (data loss); DoD 3, 4',
    aroundSubmit: async (c, submitAll) => {
      // Freeze the worker so the jobs are still queued when Redis is wiped.
      c.mark('SIGSTOP worker');
      await c.sup.signal(c.sup.worker, 'SIGSTOP');
      await submitAll();
      c.mark('FLUSHALL');
      await host.flushRedis();
      await c.sup.signal(c.sup.worker, 'SIGCONT');
      c.mark('SIGCONT worker');
    },
    markingTimeoutMs: 420_000,
  },
  {
    id: 'storage-hang',
    title: 'Object storage unresponsive (SIGSTOP 30 s) mid-exam',
    proves: '08 §25 object-storage outage; DoD 5',
    midExam: async (c) => {
      const pid = host.storagePid();
      c.mark('SIGSTOP storage');
      host.hang(pid);
      await sleep(5_000);
      const ready = await fetch(`http://127.0.0.1:${c.sup.ports[0]}/v1/health/ready`, {
        signal: AbortSignal.timeout(20_000),
      })
        .then(async (r) => `${r.status} ${await r.text()}`)
        .catch((e: Error) => `error ${e.message}`);
      c.notes.push(`Readiness during the storage outage: ${ready.slice(0, 300)}`);
      await sleep(25_000);
      host.resume(pid);
      c.mark('SIGCONT storage');
    },
  },
  {
    id: 'pg-terminate',
    title: 'Every application database connection killed, twice, mid-exam',
    proves: '08 §25 transient database failure',
    midExam: async (c) => {
      for (const n of [1, 2]) {
        const killed = await host.terminateAppBackends();
        c.mark(`pg_terminate_backend ×${killed} (${n})`);
        await sleep(8_000);
      }
    },
  },
  {
    id: 'pg-restart',
    title: 'PostgreSQL restarted mid-exam',
    proves: '08 §25 transient database failure',
    midExam: (c) => {
      c.mark('postgres restart');
      const ms = host.restartPostgres();
      c.notes.push(`Postgres restart took ${(ms / 1000).toFixed(1)} s.`);
      c.mark('postgres back');
      return Promise.resolve();
    },
  },
];

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

interface Integrity {
  inProgress: number;
  attemptsWithoutResult: number;
  resultsNotFinal: number;
  resultsIncomplete: number;
  totalsWrong: number;
  answersWithoutEvent: number;
  finalisationAudits: number;
  attemptsAuditedTwice: number;
  attempts: number;
}

async function integrity(examId: string): Promise<Integrity> {
  const db = ownerDb();
  const [row] = await db.$queryRaw<Record<string, bigint>[]>`
    WITH a AS (SELECT id, state FROM exam_attempts WHERE exam_id = ${examId}::uuid),
    qc AS (SELECT count(*) AS n FROM exam_questions WHERE exam_id = ${examId}::uuid),
    aqr AS (
      SELECT attempt_id, count(*) AS n, sum(awarded_marks) AS earned
        FROM attempt_question_results WHERE attempt_id IN (SELECT id FROM a) GROUP BY attempt_id),
    audits AS (
      SELECT entity_id, count(*) AS n FROM audit_events
       WHERE entity_id IN (SELECT id FROM a)
         AND action IN ('ATTEMPT_SUBMITTED', 'ATTEMPT_AUTO_SUBMITTED')
       GROUP BY entity_id)
    SELECT
      (SELECT count(*) FROM a) AS attempts,
      (SELECT count(*) FROM a WHERE state::text = 'IN_PROGRESS') AS in_progress,
      (SELECT count(*) FROM a WHERE NOT EXISTS (SELECT 1 FROM results r WHERE r.attempt_id = a.id)) AS without_result,
      (SELECT count(*) FROM results r WHERE r.exam_id = ${examId}::uuid AND r.state::text NOT IN ('FINAL','ADJUSTED')) AS not_final,
      (SELECT count(*) FROM results r LEFT JOIN aqr ON aqr.attempt_id = r.attempt_id
        WHERE r.exam_id = ${examId}::uuid AND coalesce(aqr.n, 0) <> (SELECT n FROM qc)) AS incomplete,
      (SELECT count(*) FROM results r JOIN aqr ON aqr.attempt_id = r.attempt_id
        WHERE r.exam_id = ${examId}::uuid AND r.earned_marks <> aqr.earned) AS totals_wrong,
      (SELECT count(*) FROM attempt_answers aa WHERE aa.attempt_id IN (SELECT id FROM a)
        AND NOT EXISTS (SELECT 1 FROM attempt_answer_events e
          WHERE e.attempt_id = aa.attempt_id AND e.exam_question_id = aa.exam_question_id
            AND e.sequence_number = aa.sequence_number AND e.accepted)) AS answers_without_event,
      (SELECT coalesce(sum(n), 0) FROM audits) AS audits,
      (SELECT count(*) FROM audits WHERE n > 1) AS audited_twice`;
  const n = (k: string) => Number(row?.[k] ?? 0);
  return {
    attempts: n('attempts'),
    inProgress: n('in_progress'),
    attemptsWithoutResult: n('without_result'),
    resultsNotFinal: n('not_final'),
    resultsIncomplete: n('incomplete'),
    totalsWrong: n('totals_wrong'),
    answersWithoutEvent: n('answers_without_event'),
    finalisationAudits: n('audits'),
    attemptsAuditedTwice: n('audited_twice'),
  };
}

/** Failed marking jobs for THIS row's attempts only (`mark-<attemptId>`) —
 * a shared Redis may hold unrelated failures from other data. */
async function failedMarkingJobs(examIds: string[]): Promise<number> {
  const rows = await ownerDb().$queryRaw<{ id: string }[]>`
    SELECT id::text FROM exam_attempts WHERE exam_id = ANY(${examIds}::uuid[])`;
  const mine = new Set(rows.map((r) => `mark-${r.id}`));
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    const failed = await redis.zrange('bull:atlas-attempt-marking:failed', '0', '-1');
    return failed.filter((id) => mine.has(id)).length;
  } finally {
    redis.disconnect();
  }
}

function integrityChecks(all: Integrity[], failedJobs: number): BudgetCheck[] {
  const sum = (k: keyof Integrity) => all.reduce((s, i) => s + i[k], 0);
  const zero = (name: string, k: keyof Integrity): BudgetCheck => ({
    name,
    actual: String(sum(k)),
    budget: '0',
    pass: sum(k) === 0,
  });
  return [
    zero('attempts left IN_PROGRESS', 'inProgress'),
    zero('attempts without a result', 'attemptsWithoutResult'),
    zero('results not FINAL', 'resultsNotFinal'),
    zero('results with a question unmarked', 'resultsIncomplete'),
    zero('results whose total ≠ sum of question marks', 'totalsWrong'),
    zero('answer rows without their accepted event', 'answersWithoutEvent'),
    {
      name: 'finalisation audited exactly once per attempt',
      actual: `${sum('finalisationAudits')} audits / ${sum('attempts')} attempts, ${sum('attemptsAuditedTwice')} twice`,
      budget: 'equal, 0 twice',
      pass: sum('finalisationAudits') === sum('attempts') && sum('attemptsAuditedTwice') === 0,
    },
    {
      name: 'marking jobs left failed',
      actual: String(failedJobs),
      budget: '0',
      pass: failedJobs === 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface ChaosOptions extends Omit<CommonOptions, 'target'> {
  sup: Supervisor;
  n: number;
  answerSeconds: number;
}

async function submitWithRetry(st: VirtualStudent): Promise<number> {
  // F13 keeps retrying a submit it could not deliver; so does the harness.
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await st.submit().catch(() => 0);
    if (status === 200 || status === 409) return status;
    await sleep(3_000);
  }
  return 0;
}

export async function runChaosRow(o: ChaosOptions, row: Row): Promise<RunReport> {
  const recorder = new Recorder();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const notes: string[] = [];
  const timeline: { t: number; event: string }[] = [];
  const mark = (event: string) =>
    timeline.push({ t: Math.round((performance.now() - t0) / 100) / 10, event });
  const common: CommonOptions = { ...o, target: o.sup.targets };

  const { seats, exams } = await seat(common, o.n, recorder, row.durationSeconds ?? 3_600);
  const students = seats.map((s, i) => {
    const st = student(common, s, i, recorder);
    st.client.failover = common.target;
    return st;
  });
  const ctx: Ctx = { sup: o.sup, students, notes, timeline, mark };

  await pool(students, 40, async (st) => {
    await st.signIn();
    await st.start({ fetchMedia: false });
    st.run();
  });
  mark(`${students.length} students answering`);

  const submitAll = async () => {
    const statuses = await Promise.all(students.map((st) => submitWithRetry(st)));
    const bad = statuses.filter((s) => s !== 200 && s !== 409).length;
    if (bad > 0) notes.push(`${bad} submissions never succeeded.`);
  };

  if (row.expire) {
    await row.expire(ctx);
  } else {
    await sleep((o.answerSeconds * 1000) / 2);
    if (row.midExam) await row.midExam(ctx);
    await sleep((o.answerSeconds * 1000) / 2);
    if (row.aroundSubmit) {
      await row.aroundSubmit(ctx, submitAll);
    } else {
      await submitAll();
      mark('all submitted');
      if (row.duringMarking) await row.duringMarking(ctx);
    }
  }

  const expectedPerExam = new Map<string, number>();
  for (const s of seats)
    expectedPerExam.set(s.exam.examId, (expectedPerExam.get(s.exam.examId) ?? 0) + 1);
  const m0 = performance.now();
  const timeout = row.markingTimeoutMs ?? 180_000;
  const waits = await Promise.all(
    exams.map((e) => awaitResults(e.examId, expectedPerExam.get(e.examId)!, timeout)),
  );
  const drained = waits.every((w) => w !== undefined);
  mark(drained ? 'marking drained' : 'marking timed out');
  const verification = await Promise.all(
    exams.map((e) =>
      verifyExam(
        e.examId,
        expectedPerExam.get(e.examId)!,
        ackMap(students.filter((s) => s.client.host === e.school.host)),
      ),
    ),
  );
  const integ = await Promise.all(exams.map((e) => integrity(e.examId)));
  const failedJobs = await failedMarkingJobs(exams.map((e) => e.examId));
  for (const st of students) st.close();
  for (const e of exams) e.teacher.close();

  const batches = recorder.stats('answer.batch');
  const rate = batches ? answerSuccessRate(batches) : undefined;
  const checks: BudgetCheck[] = [
    ...correctnessChecks(verification, expectedPerExam, { results: true }),
    ...integrityChecks(integ, failedJobs),
    {
      name: 'marking drained',
      actual: drained ? `${((performance.now() - m0) / 1000).toFixed(1)} s` : 'timed out',
      budget: `within ${timeout / 1000} s`,
      pass: drained,
    },
  ];
  const lost = students.reduce((n, s) => n + s.errors.length, 0);
  notes.push(
    `Answer batches that failed during the fault and were retried: ${lost}. Answer-save success over the run: ${rate === undefined ? 'n/a' : `${(rate * 100).toFixed(2)} %`} (a fault row is not held to the ${BUDGETS.answerSave.successMin * 100} % steady-state budget — the integrity checks are the pass condition).`,
  );
  return {
    scenario: `chaos-${row.id}`,
    title: `B22 chaos — ${row.title}`,
    startedAt,
    durationSeconds: Math.round((performance.now() - t0) / 1000),
    environment: environment(),
    parameters: {
      students: o.n,
      schools: exams.length,
      questions: o.manifest.questionCount,
      apiProcesses: o.sup.ports.length,
      proves: row.proves,
    },
    latency: recorder.all(),
    checks,
    verification,
    notes,
    extra: { timeline, integrity: integ },
  };
}
