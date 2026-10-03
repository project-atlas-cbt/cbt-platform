import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { loadAttemptHeaderOrThrow } from './attempt-mappers.js';
import type { RecordAttemptEventDto } from './dto/attempt.dto.js';

/** B21: `last_seen_at` granularity for answer-save touches. Nothing reads
 * it finer than this (the F12 disconnected indicator is minutes-scale), and
 * the heartbeat still writes on every tick. */
export const LAST_SEEN_RESOLUTION_MS = 15_000;
const LAST_TOUCHED_MAX_ENTRIES = 50_000;

/**
 * ADR-0020: integrity signals and liveness — both deliberately kept OFF the
 * hot answer-save path (never inside `AttemptAnswerService`'s own write
 * transaction; `AttemptAnswerService` calls `touchLastSeen` here as a
 * separate, post-commit, best-effort step, exactly matching R-03's "answer
 * writes must touch only `AttemptAnswer`" requirement).
 */
@Injectable()
export class AttemptEventService {
  private readonly logger = new Logger(AttemptEventService.name);
  private readonly lastTouched = new Map<string, number>();

  constructor(
    private readonly authz: AuthorizationService,
    private readonly finalization: AttemptFinalizationService,
  ) {}

  /** `POST /v1/attempts/:id/events` — a signal, never a judgement (ADR-0020:
   * "the system never labels a student as cheating"). Client-reported and
   * therefore untrusted; `occurredAt` is ordering-only metadata, never used
   * for anything admissibility-adjacent. */
  async recordEvent(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    dto: RecordAttemptEventDto,
  ): Promise<void> {
    const attempt = await loadAttemptHeaderOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.navigate', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to record events on this attempt.',
      });
    }

    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptEvent.create({
        data: {
          schoolId,
          attemptId,
          type: dto.type,
          occurredAt: new Date(dto.occurredAt),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
        },
      }),
    );
  }

  /**
   * `POST /v1/attempts/:id/heartbeat` — liveness, PLUS decision 1's
   * device/session-binding signal (confirmed this planning session,
   * extending ADR-0020's own "counts, not judgements" scope — see
   * `schema.prisma`'s B13 header comment), PLUS (B14) ADR-0004's
   * opportunistic finalisation. The heartbeat is the natural carrier for
   * all three: it already runs periodically throughout the attempt and is,
   * by design, off the critical path — never the answer-save path, and
   * never a blocking check (a mismatch is recorded, the heartbeat still
   * succeeds either way; finalizeIfExpired's own internal work happens
   * before liveness/binding are touched, since a just-finalized attempt's
   * `lastSeenAt` no longer matters the way an in-progress one's does).
   */
  async heartbeat(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    requestCtx: { ipAddress?: string; deviceId?: string },
  ): Promise<void> {
    const attempt = await loadAttemptHeaderOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.navigate', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to send a heartbeat for this attempt.',
      });
    }
    if (attempt.state === 'IN_PROGRESS') {
      await this.finalization.finalizeIfExpired(schoolId, attemptId, new Date());
    }
    await this.touchLastSeen(schoolId, attemptId);
    await this.detectBindingMismatch(schoolId, attempt, requestCtx);
  }

  /**
   * Neutral signal only — NEVER an automatic block (the roadmap's own
   * explicit instruction: a false positive here — network failover,
   * school NAT/DHCP churn, a Wi-Fi-to-hotspot switch — must never cost a
   * student their attempt). Compares only fields both sides actually have
   * (a missing `startDeviceId`, e.g. an old client build that never sent
   * `X-Device-Id`, degrades to IP-only comparison rather than firing a
   * spurious mismatch on `undefined !== 'abc'`). Best-effort: this must
   * never fail the heartbeat itself.
   */
  private async detectBindingMismatch(
    schoolId: string,
    attempt: { id: string; startIpAddress: string | null; startDeviceId: string | null },
    requestCtx: { ipAddress?: string; deviceId?: string },
  ): Promise<void> {
    const ipMismatch =
      attempt.startIpAddress !== null &&
      requestCtx.ipAddress !== undefined &&
      requestCtx.ipAddress !== attempt.startIpAddress;
    const deviceMismatch =
      attempt.startDeviceId !== null &&
      requestCtx.deviceId !== undefined &&
      requestCtx.deviceId !== attempt.startDeviceId;
    if (!ipMismatch && !deviceMismatch) return;

    try {
      await withTenant(prisma, schoolId, (tx) =>
        tx.attemptEvent.create({
          data: {
            schoolId,
            attemptId: attempt.id,
            type: 'BINDING_MISMATCH',
            occurredAt: new Date(),
            metadata: {
              ...(ipMismatch && {
                fromIp: attempt.startIpAddress,
                toIp: requestCtx.ipAddress,
              }),
              ...(deviceMismatch && {
                fromDeviceId: attempt.startDeviceId,
                toDeviceId: requestCtx.deviceId,
              }),
            },
          },
        }),
      );
    } catch (error) {
      this.logger.warn(`detectBindingMismatch failed for attempt ${attempt.id}: ${String(error)}`);
    }
  }

  /**
   * ADR-0020: "`last_seen_at`... updated by answer saves and by a
   * lightweight heartbeat." A separate, narrow `updateMany` — never the
   * attempt-answer write's own transaction (R-03: answer writes must touch
   * only `AttemptAnswer`, to avoid lock contention on the parent row under
   * 1,000-concurrent-attempt load). Best-effort: a failure here must never
   * fail the caller's own primary action (an answer save's real work is
   * already durably committed by the time this runs; the heartbeat
   * endpoint itself degrades to a quiet no-op rather than a 500 on a pure
   * liveness signal).
   */
  async touchLastSeen(
    schoolId: string,
    attemptId: string,
    opts: { coalesce?: boolean } = {},
  ): Promise<void> {
    // B21 (R-03, ADR-0020 "must not update the parent ExamAttempt row on
    // every answer save"): answer saves coalesce — at most one parent-row
    // write per attempt per LAST_SEEN_RESOLUTION_MS, skipped in-process
    // without a database round trip, and conditional in SQL so several API
    // processes coalesce too. The heartbeat (its own ~30 s cadence) always
    // writes: it is the dedicated liveness path.
    const now = Date.now();
    if (opts.coalesce) {
      const previous = this.lastTouched.get(attemptId);
      if (previous !== undefined && now - previous < LAST_SEEN_RESOLUTION_MS) return;
    }
    this.rememberTouch(attemptId, now);
    try {
      await withTenant(prisma, schoolId, (tx) =>
        tx.examAttempt.updateMany({
          where: {
            schoolId,
            id: attemptId,
            state: 'IN_PROGRESS',
            ...(opts.coalesce && {
              lastSeenAt: { lt: new Date(now - LAST_SEEN_RESOLUTION_MS) },
            }),
          },
          data: { lastSeenAt: new Date(now) },
        }),
      );
    } catch (error) {
      this.logger.warn(`touchLastSeen failed for attempt ${attemptId}: ${String(error)}`);
    }
  }

  private rememberTouch(attemptId: string, now: number): void {
    // Bounded: one entry per live attempt on this process; a full map is
    // simply cleared (the cost is one extra coalesced write per attempt).
    if (this.lastTouched.size >= LAST_TOUCHED_MAX_ENTRIES) this.lastTouched.clear();
    this.lastTouched.set(attemptId, now);
  }
}
