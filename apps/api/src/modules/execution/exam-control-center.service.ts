import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { examControlChannel } from '@atlas/domain';
import type { Env } from '@atlas/config';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { loadParentExamOrThrow } from './exam-control-mappers.js';
import { computeExamControlSnapshot } from './exam-control-snapshot.util.js';
import type { ExamControlCenterResponseDto } from './dto/exam-control-center.dto.js';

/**
 * `GET /v1/exams/:id/control` — reads the worker-computed Redis snapshot
 * (`exam-control-refresh.queue.ts`, `apps/worker`) when present; on a miss,
 * computes live directly, since B12's own query is cheap (no `ExamAttempt`
 * table exists yet — R-03's "never hit attempt tables on live polling"
 * concern is structurally inert this phase). The API never writes this
 * cache key itself, only the worker sweep does — avoiding two writers
 * racing, mirroring `PlatformMetricsService`'s own established "read-only
 * from the API side" precedent, just with a live-compute fallback this
 * phase's own cheap query set can afford that platform-wide cross-tenant
 * metrics never could.
 */
@Injectable()
export class ExamControlCenterService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<ExamControlCenterResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.controlCenter', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: "You do not have permission to view this exam's Control Center.",
      });
    }

    // B22: a Redis outage means a live compute from the database, not a 500.
    const cached = await this.redis.get(examControlChannel(schoolId, examId)).catch(() => null);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ExamControlCenterResponseDto;
        // Defence-in-depth beyond the cache key's own TTL (see
        // publishUpdate()'s and the worker sweep's own comments): `exam` was
        // already loaded fresh, above, for the permission check, so a
        // cached snapshot whose examStatus disagrees with it is known-stale
        // right now — most importantly the case a bare TTL alone can't
        // catch quickly, a snapshot cached while OPEN/CLOSED that the
        // worker sweep has since stopped refreshing because the exam
        // reached COMPLETED/CANCELLED/ARCHIVED. Never serve that; fall
        // through to a live compute instead.
        if (parsed.examStatus === exam.status) {
          return parsed;
        }
      } catch {
        // Fall through to a live compute — a corrupt/stale cache entry
        // must never surface as an error to the caller.
      }
    }

    const thresholdMs = this.config.get('EXAM_STALENESS_THRESHOLD_MS', { infer: true });
    return computeExamControlSnapshot(schoolId, examId, exam.status, thresholdMs);
  }
}
