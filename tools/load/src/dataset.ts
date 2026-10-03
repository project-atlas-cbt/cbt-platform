import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { Redis } from 'ioredis';
import { prepareExam } from './exam.js';
import { parseTargets } from './http.js';
import { Recorder } from './metrics.js';
import { awaitResults, closeObservers, ownerDb, tableSizes } from './observe.js';
import { ensureSchoolActive, loadManifest } from './provision.js';
import { VirtualStudent } from './student.js';

/**
 * B21 realistic-volume dataset for analytics budgets (DoD 10) and storage
 * projection (DoD 6): a large school's term of examinations.
 *
 * Each exam is real end to end — created, configured, made ready and opened
 * through the API (the session open writes one participant row per eligible
 * student, ADR-0006, timed here), and one real student sits it through the
 * API and is marked by the real worker. That template attempt is then
 * cloned in SQL for every other participant: attempts, immutable snapshots,
 * answers, per-question results and FINAL results, with per-student ability
 * (so scores and item statistics vary) and ~5 % absences. All database
 * triggers stay active; rows go through the same state transitions
 * (IN_PROGRESS → SUBMITTED) the engine performs.
 *
 *   pnpm --filter @atlas/load dataset --name analytics --exams 47
 */

loadRootEnv();

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: 'analytics' },
    exams: { type: 'string', default: '47' },
    absent: { type: 'string', default: '0.05' },
    target: { type: 'string', default: process.env.LOAD_TARGET ?? 'http://127.0.0.1:3001/v1' },
  },
});

async function cloneAttempts(
  templateAttemptId: string,
  examSessionId: string,
  absentRate: number,
): Promise<number> {
  const db = ownerDb();
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE ds_students ON COMMIT DROP AS
        SELECT p.student_profile_id,
               uuidv7() AS attempt_id,
               0.35 + (abs(hashtext(p.student_profile_id::text)) % 600) / 1000.0 AS ability,
               (abs(hashtext(p.student_profile_id::text || ':' || p.exam_session_id::text)) % 1000) < ${Math.round(absentRate * 1000)} AS absent
          FROM exam_session_participants p
         WHERE p.exam_session_id = '${examSessionId}'::uuid AND p.status = 'AUTHORIZED'
           AND p.student_profile_id <> (SELECT student_profile_id FROM exam_attempts WHERE id = '${templateAttemptId}'::uuid)`);
      await tx.$executeRawUnsafe(`
        INSERT INTO exam_attempts (id, school_id, exam_id, exam_session_id, student_profile_id, attempt_number,
               attempt_type, state, started_at, duration_granted_seconds, expires_at, last_seen_at, created_at, updated_at)
        SELECT s.attempt_id, t.school_id, t.exam_id, t.exam_session_id, s.student_profile_id, 1,
               'STANDARD', 'IN_PROGRESS', now() - interval '45 minutes', t.duration_granted_seconds,
               now() + interval '15 minutes', now(), now(), now()
          FROM ds_students s, exam_attempts t
         WHERE t.id = '${templateAttemptId}'::uuid AND NOT s.absent`);
      await tx.$executeRawUnsafe(`
        INSERT INTO attempt_question_snapshots (id, school_id, attempt_id, document, document_version, seed, created_at)
        SELECT uuidv7(), t.school_id, s.attempt_id, t.document, t.document_version, gen_random_uuid()::text, now()
          FROM ds_students s, attempt_question_snapshots t
         WHERE t.attempt_id = '${templateAttemptId}'::uuid AND NOT s.absent`);
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE ds_items ON COMMIT DROP AS
        SELECT s.attempt_id,
               (q->>'examQuestionId')::uuid AS exam_question_id,
               (q->>'marks')::int AS marks,
               random() < 0.03 AS unanswered,
               random() < s.ability AS correct,
               (SELECT (o->>'optionId')::uuid FROM jsonb_array_elements(q->'options') o WHERE (o->>'correctFlag')::boolean LIMIT 1) AS correct_option,
               (SELECT (o->>'optionId')::uuid FROM jsonb_array_elements(q->'options') o WHERE NOT (o->>'correctFlag')::boolean ORDER BY random() LIMIT 1) AS wrong_option
          FROM ds_students s
          JOIN attempt_question_snapshots t ON t.attempt_id = '${templateAttemptId}'::uuid
          CROSS JOIN LATERAL jsonb_array_elements(t.document->'questions') q
         WHERE NOT s.absent`);
      await tx.$executeRawUnsafe(`
        INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state,
               sequence_number, answered_at, last_saved_at)
        SELECT uuidv7(), a.school_id, i.attempt_id, i.exam_question_id,
               CASE WHEN i.correct THEN i.correct_option ELSE i.wrong_option END, 'ANSWERED', 1 + (random() * 2)::int, now(), now()
          FROM ds_items i JOIN exam_attempts a ON a.id = i.attempt_id
         WHERE NOT i.unanswered`);
      await tx.$executeRawUnsafe(`
        UPDATE exam_attempts SET state = 'SUBMITTED', submitted_at = now() - interval '5 minutes', updated_at = now()
         WHERE id IN (SELECT attempt_id FROM ds_students WHERE NOT absent)`);
      await tx.$executeRawUnsafe(`
        INSERT INTO attempt_question_results (id, school_id, attempt_id, exam_question_id, correctness, awarded_marks, maximum_marks, updated_at)
        SELECT uuidv7(), a.school_id, i.attempt_id, i.exam_question_id,
               (CASE WHEN i.unanswered THEN 'UNANSWERED' WHEN i.correct THEN 'CORRECT' ELSE 'INCORRECT' END)::"AttemptQuestionCorrectness",
               CASE WHEN NOT i.unanswered AND i.correct THEN i.marks ELSE 0 END, i.marks, now()
          FROM ds_items i JOIN exam_attempts a ON a.id = i.attempt_id`);
      await tx.$executeRawUnsafe(`
        INSERT INTO results (id, school_id, attempt_id, exam_id, student_profile_id, state, total_marks, earned_marks, percentage,
               correct_count, incorrect_count, unanswered_count, partial_count, grade, grading_scale_version_id, finalized_at, updated_at)
        SELECT uuidv7(), a.school_id, a.id, a.exam_id, a.student_profile_id, 'FINAL', agg.total, agg.earned,
               round(agg.earned * 100.0 / NULLIF(agg.total, 0), 2), agg.correct, agg.incorrect, agg.unanswered, 0,
               (SELECT b.label FROM grading_scale_bands b
                 WHERE b.version_id = tr.grading_scale_version_id
                   AND round(agg.earned * 100.0 / NULLIF(agg.total, 0), 2) >= b.min_percentage
                 ORDER BY b.min_percentage DESC LIMIT 1),
               tr.grading_scale_version_id, now(), now()
          FROM exam_attempts a
          JOIN (SELECT attempt_id, sum(maximum_marks) AS total, sum(awarded_marks) AS earned,
                       count(*) FILTER (WHERE correctness = 'CORRECT') AS correct,
                       count(*) FILTER (WHERE correctness = 'INCORRECT') AS incorrect,
                       count(*) FILTER (WHERE correctness = 'UNANSWERED') AS unanswered
                  FROM attempt_question_results
                 WHERE attempt_id IN (SELECT attempt_id FROM ds_students WHERE NOT absent)
                 GROUP BY attempt_id) agg ON agg.attempt_id = a.id
          JOIN results tr ON tr.attempt_id = '${templateAttemptId}'::uuid`);
      await tx.$executeRawUnsafe(`
        INSERT INTO exam_participations (id, school_id, exam_id, exam_session_id, student_profile_id, status, marked_at, marked_by_membership_id, reason)
        SELECT uuidv7(), tp.school_id, tp.exam_id, tp.exam_session_id, s.student_profile_id,
               (CASE WHEN s.absent THEN 'ABSENT' ELSE 'ATTENDED' END)::"ExamParticipationStatus",
               now(), tp.marked_by_membership_id, CASE WHEN s.absent THEN 'Load dataset: absent' END
          FROM ds_students s
          JOIN exam_participations tp ON tp.exam_session_id = '${examSessionId}'::uuid
           AND tp.student_profile_id = (SELECT student_profile_id FROM exam_attempts WHERE id = '${templateAttemptId}'::uuid)
        ON CONFLICT DO NOTHING`);
      const [n] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM ds_students WHERE NOT absent`,
      );
      return Number(n?.n ?? 0);
    },
    { timeout: 600_000, maxWait: 60_000 },
  );
}

async function main(): Promise<void> {
  const manifest = await loadManifest(values.name);
  const target = parseTargets(values.target)[0]!;
  const school = manifest.schools[0]!;
  await ensureSchoolActive(school.schoolId);
  const recorder = new Recorder();
  const before = await tableSizes();
  const sessionOpen: number[] = [];
  let attempts = 0;
  const exams = Number(values.exams);
  for (let e = 0; e < exams; e++) {
    const t0 = performance.now();
    const exam = await prepareExam(manifest, school, target, recorder, {
      durationSeconds: 3600,
      randomize: true,
    });
    sessionOpen.push(Math.round(exam.sessionOpenMs));
    const template = new VirtualStudent({
      target,
      host: school.host,
      sourceIp: '10.250.0.10',
      identifier: school.students[e % school.students.length]!.identifier,
      password: manifest.password,
      examId: exam.examId,
      recorder,
      heartbeatMs: 30_000,
      answerIntervalMs: 1_000,
    });
    await template.signIn();
    await template.start({ fetchMedia: false });
    for (let q = 0; q < template.questions.length; q++) template.answerOne();
    await template.flush();
    await template.submit();
    if ((await awaitResults(exam.examId, 1, 120_000)) === undefined)
      throw new Error('template attempt was not marked');
    attempts +=
      1 + (await cloneAttempts(template.attemptId!, exam.examSessionId, Number(values.absent)));
    template.close();
    exam.teacher.close();
    console.log(
      `[dataset] exam ${e + 1}/${exams}: session open ${Math.round(exam.sessionOpenMs)} ms, total attempts ${attempts} (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
    );
  }
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.incr(`atlas:analytics:school:${school.schoolId}:version`);
  redis.disconnect();
  await ownerDb().$executeRawUnsafe('ANALYZE');
  const after = await tableSizes();
  const growth = after.map((t) => {
    const b = before.find((x) => x.table === t.table)!;
    return { table: t.table, rows: t.rows - b.rows, bytes: t.totalBytes - b.totalBytes };
  });
  console.log(
    JSON.stringify(
      { school: school.schoolId, exams, attempts, sessionOpenMs: sessionOpen, growth },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await closeObservers();
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await closeObservers().catch(() => undefined);
    process.exit(1);
  });
