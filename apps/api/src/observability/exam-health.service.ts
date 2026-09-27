import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { captureOperationalAlert, examMetrics, structuredLog } from '@atlas/observability';
import { REDIS_CLIENT } from '../redis/redis.module.js';

interface HealthResult {
  total: number;
  successRate: number;
  alerted: boolean;
}

@Injectable()
export class ExamHealthService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async recordAnswerSave(schoolId: string, succeeded: boolean, latencyMs: number): Promise<void> {
    examMetrics.answerSaves.add(1, { schoolId, outcome: succeeded ? 'success' : 'failure' });
    examMetrics.answerSaveLatency.record(latencyMs, { schoolId });
    if (!succeeded) examMetrics.answerSyncFailures.add(1, { schoolId });

    const bucket = Math.floor(Date.now() / 60_000);
    const key = `atlas:exam-health:answer-save:${schoolId}:${bucket}`;
    const field = succeeded ? 'success' : 'failure';
    const ttl = this.config.get('EXAM_HEALTH_WINDOW_SECONDS', { infer: true }) + 120;
    await this.redis.multi().hincrby(key, field, 1).expire(key, ttl).exec();
    await this.evaluateAnswerSaveHealth(schoolId);
  }

  async evaluateAnswerSaveHealth(schoolId: string): Promise<HealthResult> {
    const windowSeconds = this.config.get('EXAM_HEALTH_WINDOW_SECONDS', { infer: true });
    const bucketCount = Math.max(1, Math.ceil(windowSeconds / 60));
    const currentBucket = Math.floor(Date.now() / 60_000);
    const pipeline = this.redis.pipeline();
    for (let offset = 0; offset < bucketCount; offset += 1) {
      pipeline.hmget(
        `atlas:exam-health:answer-save:${schoolId}:${currentBucket - offset}`,
        'success',
        'failure',
      );
    }
    const rows = await pipeline.exec();
    let success = 0;
    let failure = 0;
    for (const [, value] of rows ?? []) {
      if (!Array.isArray(value)) continue;
      success += Number(value[0] ?? 0);
      failure += Number(value[1] ?? 0);
    }
    const total = success + failure;
    const successRate = total === 0 ? 100 : (success / total) * 100;
    const minSamples = this.config.get('EXAM_HEALTH_MIN_SAMPLES', { infer: true });
    const threshold = this.config.get('EXAM_HEALTH_SUCCESS_THRESHOLD_PERCENT', { infer: true });
    if (total < minSamples || successRate >= threshold) {
      return { total, successRate, alerted: false };
    }

    const cooldownKey = `atlas:exam-health:answer-save-alert:${schoolId}`;
    const acquired = await this.redis.set(
      cooldownKey,
      String(Date.now()),
      'EX',
      this.config.get('EXAM_HEALTH_ALERT_COOLDOWN_SECONDS', { infer: true }),
      'NX',
    );
    if (acquired !== 'OK') {
      return { total, successRate, alerted: false };
    }

    examMetrics.operationalAlerts.add(1, { schoolId, alert: 'answer_save_success_drop' });
    structuredLog('error', 'exam.health.answer-save-success-drop', {
      schoolId,
      sampleCount: total,
      successRatePercent: Number(successRate.toFixed(2)),
      thresholdPercent: threshold,
    });
    captureOperationalAlert('Exam answer-save success rate below threshold', {
      schoolId,
      sampleCount: total,
      successRatePercent: Number(successRate.toFixed(2)),
      thresholdPercent: threshold,
    });
    return { total, successRate, alerted: true };
  }
}
