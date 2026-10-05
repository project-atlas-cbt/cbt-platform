import { randomUUID } from 'node:crypto';
import { Client, type Target } from './http.js';
import type { Recorder } from './metrics.js';
import type { Manifest, ProvisionedSchool } from './provision.js';

export interface PreparedExam {
  school: ProvisionedSchool;
  examId: string;
  examTitle: string;
  examSessionId: string;
  /** Opening the session writes one participant row per eligible student (ADR-0006) — sized here. */
  sessionOpenMs: number;
  teacher: Client;
}

/** A fresh exam per run: attemptLimit 1 means a student can't sit the same exam twice. */
export async function prepareExam(
  manifest: Manifest,
  school: ProvisionedSchool,
  target: Target,
  recorder: Recorder,
  opts: { durationSeconds: number; randomize: boolean },
): Promise<PreparedExam> {
  const teacher = new Client(
    target,
    school.host,
    `10.201.${school.index % 250}.2`,
    recorder,
    randomUUID(),
  );
  const login = await teacher.login(school.teacher.identifier, manifest.password);
  if (login.status !== 200) throw new Error(`teacher login ${login.status}: ${login.raw}`);

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await teacher.request<T>(method, path, { label: 'setup', body });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`${method} ${path} ${res.status}: ${res.raw.slice(0, 300)}`);
    return res.body;
  };

  const title = `Load ${new Date().toISOString().slice(0, 16)} ${randomUUID().slice(0, 4)}`;
  const exam = await call<{ id: string }>('POST', '/exams', {
    academicSessionId: school.academicSessionId,
    academicTermId: school.academicTermId,
    subjectId: school.subjectId,
    title,
    examType: 'Test',
    classIds: school.classIds,
  });
  await call('PUT', `/exams/${exam.id}/questions`, {
    questions: school.questionRevisionIds.map((questionRevisionId) => ({ questionRevisionId })),
  });
  await call('PUT', `/exams/${exam.id}/configuration`, {
    durationSeconds: opts.durationSeconds,
    attemptLimit: 1,
    randomizeQuestions: opts.randomize,
    randomizeOptions: opts.randomize,
    resultPolicy: 'TEACHER',
    resultDetailVisibility: 'SCORE_AND_COUNTS',
    generalInstructions: 'Answer all questions.',
    navigationInstructions: 'Free navigation.',
    submissionInstructions: 'Submit when done.',
    accessMode: 'OPEN_TO_ELIGIBLE',
  });
  await call('POST', `/exams/${exam.id}/ready`, {});
  const t0 = performance.now();
  const res = await teacher.request<{ id: string }>('POST', `/exams/${exam.id}/sessions`, {
    label: 'session.open',
    body: {},
  });
  const sessionOpenMs = performance.now() - t0;
  if (res.status !== 201) throw new Error(`open session ${res.status}: ${res.raw.slice(0, 300)}`);
  return {
    school,
    examId: exam.id,
    examTitle: title,
    examSessionId: res.body.id,
    sessionOpenMs,
    teacher,
  };
}
