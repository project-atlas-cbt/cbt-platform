import os from 'node:os';
import { Redis } from 'ioredis';
import { createPrismaClient, type PrismaClient } from '@atlas/db';

/**
 * Server-side observation during a run, through the schema-owner
 * connection (a superuser locally, so it sees every school and every
 * backend — this is measurement, never application code).
 */

let owner: PrismaClient | undefined;
export function ownerDb(): PrismaClient {
  if (!owner) {
    const url = process.env.LOAD_OWNER_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL (schema owner) is required for load-test observation');
    owner = createPrismaClient(url);
  }
  return owner;
}

export async function closeObservers(): Promise<void> {
  await owner?.$disconnect();
  owner = undefined;
}

export interface Sample {
  t: number;
  connections: number;
  active: number;
  idleInTransaction: number;
  waitingLocks: number;
  xactCommit: number;
  redisClients: number;
  redisMemoryMb: number;
  hostFreeMemoryMb: number;
}

/** Below this much free host RAM the OS pages — latency then measures the
 * page file, not the platform (B21: found on the 7.7 GB workstation). */
export const HOST_MEMORY_PRESSURE_MB = 500;

export interface SamplerSummary {
  samples: number;
  peakConnections: number;
  peakActive: number;
  peakIdleInTransaction: number;
  peakWaitingLocks: number;
  avgCommitsPerSecond: number;
  peakCommitsPerSecond: number;
  peakRedisClients: number;
  peakRedisMemoryMb: number;
  minHostFreeMemoryMb: number;
  hostMemoryPressure: boolean;
}

export class Sampler {
  private timer: NodeJS.Timeout | undefined;
  readonly samples: Sample[] = [];
  private readonly redis: Redis;

  constructor(private readonly intervalMs = 5_000) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
    });
  }

  async start(): Promise<void> {
    await this.redis.connect().catch(() => undefined);
    await this.sample();
    this.timer = setInterval(() => void this.sample().catch(() => undefined), this.intervalMs);
  }

  async stop(): Promise<SamplerSummary> {
    if (this.timer) clearInterval(this.timer);
    await this.sample().catch(() => undefined);
    this.redis.disconnect();
    return this.summary();
  }

  private async sample(): Promise<void> {
    const db = ownerDb();
    const [activity] = await db.$queryRaw<
      { total: bigint; active: bigint; idle_tx: bigint }[]
    >`SELECT count(*) AS total,
             count(*) FILTER (WHERE state = 'active') AS active,
             count(*) FILTER (WHERE state LIKE 'idle in transaction%') AS idle_tx
        FROM pg_stat_activity
       WHERE datname = current_database() AND backend_type = 'client backend'`;
    const [locks] = await db.$queryRaw<
      { waiting: bigint }[]
    >`SELECT count(*) AS waiting FROM pg_locks WHERE NOT granted`;
    const [xact] = await db.$queryRaw<
      { commits: bigint }[]
    >`SELECT xact_commit AS commits FROM pg_stat_database WHERE datname = current_database()`;
    let redisClients = 0;
    let redisMemoryMb = 0;
    try {
      const info = await this.redis.info();
      redisClients = Number(/connected_clients:(\d+)/.exec(info)?.[1] ?? 0);
      redisMemoryMb = Number(/used_memory:(\d+)/.exec(info)?.[1] ?? 0) / 1_048_576;
    } catch {
      // Redis observation is best-effort.
    }
    this.samples.push({
      t: Date.now(),
      connections: Number(activity?.total ?? 0),
      active: Number(activity?.active ?? 0),
      idleInTransaction: Number(activity?.idle_tx ?? 0),
      waitingLocks: Number(locks?.waiting ?? 0),
      xactCommit: Number(xact?.commits ?? 0),
      redisClients,
      redisMemoryMb: Math.round(redisMemoryMb * 10) / 10,
      hostFreeMemoryMb: Math.round(os.freemem() / 1_048_576),
    });
  }

  summary(): SamplerSummary {
    const s = this.samples;
    const rates: number[] = [];
    for (let i = 1; i < s.length; i++) {
      const dt = (s[i]!.t - s[i - 1]!.t) / 1000;
      if (dt > 0) rates.push((s[i]!.xactCommit - s[i - 1]!.xactCommit) / dt);
    }
    const max = (f: (x: Sample) => number) => s.reduce((m, x) => Math.max(m, f(x)), 0);
    return {
      samples: s.length,
      peakConnections: max((x) => x.connections),
      peakActive: max((x) => x.active),
      peakIdleInTransaction: max((x) => x.idleInTransaction),
      peakWaitingLocks: max((x) => x.waitingLocks),
      avgCommitsPerSecond: rates.length
        ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
        : 0,
      peakCommitsPerSecond: Math.round(rates.reduce((m, x) => Math.max(m, x), 0)),
      peakRedisClients: max((x) => x.redisClients),
      peakRedisMemoryMb: max((x) => x.redisMemoryMb),
      minHostFreeMemoryMb: s.reduce(
        (m, x) => Math.min(m, x.hostFreeMemoryMb),
        Number.POSITIVE_INFINITY,
      ),
      hostMemoryPressure: s.some((x) => x.hostFreeMemoryMb < HOST_MEMORY_PRESSURE_MB),
    };
  }
}

/** pg_stat_statements lives in schema `perf` (infra/load/docker-compose.load.yml + docs/performance/load-testing.md); absent elsewhere. */
export async function resetStatements(): Promise<boolean> {
  try {
    await ownerDb().$executeRawUnsafe('SELECT perf.pg_stat_statements_reset()');
    return true;
  } catch {
    return false;
  }
}

export interface StatementRow {
  query: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  rows: number;
}

export async function topStatements(limit = 15): Promise<StatementRow[]> {
  try {
    const rows = await ownerDb().$queryRawUnsafe<
      { query: string; calls: bigint; total: number; mean: number; rows: bigint }[]
    >(
      `SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query, calls,
              total_exec_time AS total, mean_exec_time AS mean, rows
         FROM perf.pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY total_exec_time DESC LIMIT ${Number(limit)}`,
    );
    return rows.map((r) => ({
      query: r.query,
      calls: Number(r.calls),
      totalMs: Math.round(r.total),
      meanMs: Math.round(r.mean * 1000) / 1000,
      rows: Number(r.rows),
    }));
  } catch {
    return [];
  }
}

export const GROWTH_TABLES = [
  'exam_attempts',
  'attempt_question_snapshots',
  'attempt_answers',
  'attempt_answer_events',
  'attempt_question_results',
  'attempt_events',
  'results',
  'exam_session_participants',
  'exam_participations',
  'audit_events',
] as const;

export interface TableSize {
  table: string;
  rows: number;
  totalBytes: number;
}

export async function tableSizes(): Promise<TableSize[]> {
  const out: TableSize[] = [];
  for (const table of GROWTH_TABLES) {
    const [r] = await ownerDb().$queryRawUnsafe<{ rows: bigint; bytes: bigint }[]>(
      `SELECT (SELECT count(*) FROM "${table}") AS rows, pg_total_relation_size('"${table}"') AS bytes`,
    );
    out.push({ table, rows: Number(r?.rows ?? 0), totalBytes: Number(r?.bytes ?? 0) });
  }
  return out;
}

export interface VerifyResult {
  examId: string;
  expectedAttempts: number;
  attempts: number;
  distinctStudents: number;
  duplicateActive: number;
  statesByCount: Record<string, number>;
  results: number;
  resultsFinal: number;
  answersChecked: number;
  answersMismatched: number;
}

/**
 * Exactly-N attempts, no duplicates, N results, and the no-lost-answer
 * oracle: every answer the server acknowledged is what is stored.
 */
export async function verifyExam(
  examId: string,
  expectedAttempts: number,
  acked: Map<string, Map<string, { selectedOptionId: string; sequenceNumber: number }>>,
): Promise<VerifyResult> {
  const db = ownerDb();
  const [a] = await db.$queryRaw<{ attempts: bigint; students: bigint }[]>`
    SELECT count(*) AS attempts, count(DISTINCT student_profile_id) AS students
      FROM exam_attempts WHERE exam_id = ${examId}::uuid`;
  const states = await db.$queryRaw<{ state: string; n: bigint }[]>`
    SELECT state::text AS state, count(*) AS n FROM exam_attempts WHERE exam_id = ${examId}::uuid GROUP BY state`;
  const [dup] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT student_profile_id FROM exam_attempts WHERE exam_id = ${examId}::uuid
       GROUP BY student_profile_id HAVING count(*) > 1) d`;
  const [r] = await db.$queryRaw<{ results: bigint; final: bigint }[]>`
    SELECT count(*) AS results, count(*) FILTER (WHERE state::text IN ('FINAL','ADJUSTED')) AS final
      FROM results WHERE exam_id = ${examId}::uuid`;

  let checked = 0;
  let mismatched = 0;
  const attemptIds = [...acked.keys()];
  for (let i = 0; i < attemptIds.length; i += 500) {
    const slice = attemptIds.slice(i, i + 500);
    const rows = await db.$queryRaw<
      {
        attempt_id: string;
        exam_question_id: string;
        selected_option_id: string | null;
        sequence_number: number;
      }[]
    >`SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number
        FROM attempt_answers WHERE attempt_id = ANY(${slice}::uuid[])`;
    const stored = new Map(rows.map((x) => [`${x.attempt_id}:${x.exam_question_id}`, x]));
    for (const attemptId of slice) {
      for (const [questionId, ack] of acked.get(attemptId)!) {
        checked += 1;
        const row = stored.get(`${attemptId}:${questionId}`);
        // The stored row may be *newer* than our last ack (a later write
        // landed but its response was lost) — never older.
        if (!row || row.sequence_number < ack.sequenceNumber) mismatched += 1;
        else if (
          row.sequence_number === ack.sequenceNumber &&
          row.selected_option_id !== ack.selectedOptionId
        )
          mismatched += 1;
      }
    }
  }
  return {
    examId,
    expectedAttempts,
    attempts: Number(a?.attempts ?? 0),
    distinctStudents: Number(a?.students ?? 0),
    duplicateActive: Number(dup?.n ?? 0),
    statesByCount: Object.fromEntries(states.map((s) => [s.state, Number(s.n)])),
    results: Number(r?.results ?? 0),
    resultsFinal: Number(r?.final ?? 0),
    answersChecked: checked,
    answersMismatched: mismatched,
  };
}

/** Polls until every submitted attempt of the exam has a FINAL result (marking drained). */
export async function awaitResults(
  examId: string,
  expected: number,
  timeoutMs: number,
): Promise<number | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const [r] = await ownerDb().$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM results WHERE exam_id = ${examId}::uuid AND state::text IN ('FINAL','ADJUSTED')`;
    if (Number(r?.n ?? 0) >= expected) return Date.now() - t0;
    await new Promise((res) => setTimeout(res, 1_000));
  }
  return undefined;
}
