import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Redis } from 'ioredis';
import { Client, type Target } from './http.js';
import { BUDGETS, Recorder, type BudgetCheck } from './metrics.js';
import { ownerDb, tableSizes } from './observe.js';
import type { Manifest } from './provision.js';
import { environment, type RunReport } from './report.js';

/**
 * DoD 10: analytics queries meet budget on realistic data volumes (run
 * after `dataset`). Every analytics endpoint is timed twice per resource:
 * cold (the school's analytics cache version bumped first, so nothing is
 * served from Redis) and cached (the immediate repeat). Run as the School
 * Admin, whose audience sees the whole school — the widest query shape.
 */
export async function runAnalyticsBench(
  manifest: Manifest,
  target: Target,
  samplesPerEndpoint: number,
): Promise<RunReport> {
  const school = manifest.schools[0]!;
  const recorder = new Recorder();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const db = ownerDb();
  const exams = await db.$queryRaw<{ id: string; n: bigint }[]>`
    SELECT e.id::text, count(r.id) AS n FROM exams e LEFT JOIN results r ON r.exam_id = e.id
     WHERE e.school_id = ${school.schoolId}::uuid GROUP BY e.id ORDER BY n DESC`;
  const depts = await db.$queryRaw<
    { id: string }[]
  >`SELECT id::text FROM departments WHERE school_id = ${school.schoolId}::uuid`;
  const students = await db.$queryRaw<{ id: string }[]>`
    SELECT student_profile_id::text AS id FROM results WHERE school_id = ${school.schoolId}::uuid
     GROUP BY student_profile_id ORDER BY count(*) DESC LIMIT ${samplesPerEndpoint}`;
  const [volume] = await db.$queryRaw<{ results: bigint; aqr: bigint; attempts: bigint }[]>`
    SELECT (SELECT count(*) FROM results WHERE school_id = ${school.schoolId}::uuid) AS results,
           (SELECT count(*) FROM attempt_question_results WHERE school_id = ${school.schoolId}::uuid) AS aqr,
           (SELECT count(*) FROM exam_attempts WHERE school_id = ${school.schoolId}::uuid) AS attempts`;

  const admin = new Client(target, school.host, '10.204.0.1', recorder, randomUUID());
  const login = await admin.login(school.admin.identifier, manifest.password);
  if (login.status !== 200) throw new Error(`admin login ${login.status}`);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const bump = () => redis.incr(`atlas:analytics:school:${school.schoolId}:version`);

  const pick = <T>(xs: T[]) => xs.slice(0, samplesPerEndpoint);
  const targets: [string, string][] = [
    ...pick(exams).map((e): [string, string] => ['exam', `/analytics/exams/${e.id}`]),
    ...pick(exams).map((e): [string, string] => [
      'questions',
      `/analytics/exams/${e.id}/questions`,
    ]),
    ...pick(school.classIds).map((id): [string, string] => ['class', `/analytics/classes/${id}`]),
    ...pick(depts).map((d): [string, string] => ['department', `/analytics/departments/${d.id}`]),
    ...Array.from({ length: samplesPerEndpoint }, (): [string, string] => [
      'school',
      '/analytics/school',
    ]),
    ...students.map((s): [string, string] => ['student', `/analytics/students/${s.id}`]),
  ];
  const statuses: Record<string, number> = {};
  for (const [kind, path] of targets) {
    await bump();
    const cold = await admin.request('GET', path, { label: `analytics.${kind}.cold` });
    const warm = await admin.request('GET', path, { label: `analytics.${kind}.cached` });
    for (const s of [cold.status, warm.status]) statuses[s] = (statuses[s] ?? 0) + 1;
  }
  redis.disconnect();
  admin.close();

  const checks: BudgetCheck[] = [];
  for (const kind of ['exam', 'questions', 'class', 'department', 'school', 'student']) {
    const cold = recorder.stats(`analytics.${kind}.cold`);
    const cached = recorder.stats(`analytics.${kind}.cached`);
    if (cold)
      checks.push({
        name: `${kind} cold p95`,
        actual: `${cold.p95} ms`,
        budget: `≤ ${BUDGETS.analytics.coldP95} ms`,
        pass: cold.p95 <= BUDGETS.analytics.coldP95,
      });
    if (cached)
      checks.push({
        name: `${kind} cached p95`,
        actual: `${cached.p95} ms`,
        budget: `≤ ${BUDGETS.analytics.cachedP95} ms`,
        pass: cached.p95 <= BUDGETS.analytics.cachedP95,
      });
  }
  const non200 = Object.entries(statuses)
    .filter(([s]) => s !== '200')
    .reduce((n, [, c]) => n + c, 0);
  checks.push({
    name: 'analytics responses 200',
    actual: `${non200} non-200`,
    budget: '0',
    pass: non200 === 0,
  });
  const sizes = await tableSizes();
  return {
    scenario: 'analytics',
    title: 'B21 analytics on a realistic school dataset',
    startedAt,
    durationSeconds: Math.round((performance.now() - t0) / 1000),
    environment: environment(),
    parameters: {
      exams: exams.length,
      largestExamResults: Number(exams[0]?.n ?? 0),
      results: Number(volume?.results ?? 0),
      attemptQuestionResults: Number(volume?.aqr ?? 0),
      attempts: Number(volume?.attempts ?? 0),
      classes: school.classIds.length,
      samplesPerEndpoint,
    },
    latency: recorder.all(),
    checks,
    notes: [],
    extra: { tableSizesAfter: sizes },
  };
}
