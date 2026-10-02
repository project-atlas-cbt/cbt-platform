import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  examInstruments,
  recordHealthCounter,
  recordSubmissionLatency,
  type AnswerSaveOutcome,
} from '@atlas/observability';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * B20 (09 §36 examination metrics; 09 §37 Exam Health Monitor): the one
 * place the attempt engine reports what happened on its hot paths. Each
 * measurement goes two ways — an OpenTelemetry instrument (dashboards,
 * no-op without an exporter) and a per-minute Redis bucket the worker's
 * health monitor reads (alerting that works with no vendor at all).
 *
 * Never throws and never awaits on the request path's behalf: telemetry
 * failing must not fail an answer save.
 */
@Injectable()
export class ExamTelemetryService {
  private readonly logger = new Logger('ExamTelemetry');

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** An error thrown out of the answer path: a deliberate 4xx refusal
   * (attempt expired, not writable, not yours) is the server answering
   * correctly — `rejected`; anything else is a server-side `failed`. */
  static classifyError(err: unknown): AnswerSaveOutcome {
    return err instanceof AppHttpException && err.httpStatus < 500 ? 'rejected' : 'failed';
  }

  answerSave(outcome: AnswerSaveOutcome, durationMs?: number): void {
    const i = examInstruments();
    i.answerSave.add(1, { outcome });
    if (durationMs !== undefined) i.answerSaveDuration.record(durationMs, { outcome });
    const counter =
      outcome === 'ok'
        ? 'answer_save_ok'
        : outcome === 'failed'
          ? 'answer_save_failed'
          : 'answer_save_rejected';
    this.fireAndForget(recordHealthCounter(this.redis, counter));
  }

  attemptStarted(): void {
    examInstruments().attemptStart.add(1);
    this.fireAndForget(recordHealthCounter(this.redis, 'attempt_started'));
  }

  submission(kind: 'manual' | 'staff_end', durationMs: number): void {
    const i = examInstruments();
    i.submission.add(1, { kind });
    i.submissionDuration.record(durationMs, { kind });
    this.fireAndForget(recordSubmissionLatency(this.redis, durationMs));
  }

  private fireAndForget(p: Promise<unknown>): void {
    p.catch((err: unknown) => this.logger.warn({ msg: 'Exam health counter write failed', err }));
  }
}
