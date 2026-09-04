import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { ServerResponse } from 'node:http';
import {
  EXAM_CONTROL_CACHE_TTL_SECONDS,
  examControlChannel,
  examControlStreamKey,
} from '@atlas/domain';
import type { Env } from '@atlas/config';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { REDIS_CLIENT, REDIS_SUBSCRIBER_CLIENT } from '../../redis/redis.module.js';
import { loadParentExamOrThrow, type ExamControlParentExam } from './exam-control-mappers.js';
import { computeExamControlSnapshot } from './exam-control-snapshot.util.js';

interface Connection {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const STREAM_MAXLEN = 1000;
const STREAM_TTL_SECONDS = 2 * 60 * 60;

function writeEvent(res: ServerResponse, data: string, id?: string): void {
  if (id !== undefined) res.write(`id: ${id}\n`);
  res.write(`data: ${data}\n\n`);
}

/**
 * `GET /v1/exams/:id/control/stream` — hand-rolled raw Fastify streaming,
 * no `@Sse()` decorator, no new dependency (AGENTS §9): the amount of
 * custom per-connection logic (per-exam scoping, `Last-Event-ID` replay,
 * heartbeat, disconnect cleanup) is the same regardless of framing
 * mechanism. Session-cookie auth (verified: `AuthGuard` resolves sessions
 * from a cookie, not a header) means `EventSource` with
 * `withCredentials: true` works through the ordinary `@Authorized(...)` +
 * `AuthGuard` pipeline.
 *
 * `@Authorized('examAdmin.controlCenter')` on the controller only proves
 * the actor's role *could* hold this permission in principle (no resource
 * is available to the guard for a bare `GET .../stream` route) — exactly
 * like every other route in this module, the resource-scoped check (OWNED/
 * DEPARTMENT/delegate) is this service's own job via `assertAccess()`,
 * called by the controller BEFORE it writes any SSE response headers. This
 * was a real gap found in review: `attach()` alone only ever verified the
 * exam exists in this tenant (`loadParentExamOrThrow`), never that this
 * specific actor may see it — any TEACHER/HOD in the school could stream
 * any other exam's live Control Center regardless of ownership/department.
 *
 * One shared Redis subscriber connection for the whole API process (R-04's
 * own connection-count concern) — every active exam-control channel's
 * `SUBSCRIBE`/`UNSUBSCRIBE` shares `REDIS_SUBSCRIBER_CLIENT`, never one
 * connection per SSE client. Events are snapshot-shaped (the full current
 * aggregate, never a delta), so a duplicate delivery in the narrow
 * replay-then-subscribe handoff window is harmless to apply twice — an
 * accepted, documented small race, not solved with distributed locking.
 */
@Injectable()
export class ExamControlStreamService {
  private readonly logger = new Logger(ExamControlStreamService.name);
  private readonly connectionsByChannel = new Map<string, Set<Connection>>();
  private listenerAttached = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER_CLIENT) private readonly subscriber: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly authz: AuthorizationService,
  ) {}

  private ensureMessageListener(): void {
    if (this.listenerAttached) return;
    this.listenerAttached = true;
    this.subscriber.on('message', (channel: string, message: string) => {
      const connections = this.connectionsByChannel.get(channel);
      if (!connections) return;
      for (const connection of connections) {
        writeEvent(connection.res, message);
      }
    });
  }

  /** Must be called by the controller — and must complete successfully —
   * before any SSE response header is written. Loads the exam (tenant/
   * existence check, NOT_FOUND on a cross-school or missing id) and
   * re-evaluates `examAdmin.controlCenter` against its real resource
   * context (ownership/department/delegate), exactly like `ExamControlCenterService
   * .get()`'s own equivalent check for the polling endpoint. Throwing here
   * — before `writeHead` — is also what lets a NOT_FOUND/FORBIDDEN response
   * render as an ordinary JSON error instead of committing a 200 SSE
   * response first and only then discovering the request should have been
   * rejected. */
  async assertAccess(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<ExamControlParentExam> {
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
    return exam;
  }

  /** The controller has already called `assertAccess()` and written the SSE
   * response headers before calling this. Replays missed events from the
   * Redis Stream when `lastEventId` is given; otherwise writes one
   * immediate live snapshot so a fresh connection needs no separate
   * `GET .../control` call. Either way, the connection is then subscribed
   * to live updates until it disconnects. */
  async attach(
    res: ServerResponse,
    params: { schoolId: string; examId: string; lastEventId?: string },
  ): Promise<void> {
    this.ensureMessageListener();
    const { schoolId, examId, lastEventId } = params;
    const channel = examControlChannel(schoolId, examId);
    const streamKey = examControlStreamKey(schoolId, examId);
    const thresholdMs = this.config.get('EXAM_STALENESS_THRESHOLD_MS', { infer: true });

    if (lastEventId !== undefined) {
      const entries = await this.redis.xrange(streamKey, `(${lastEventId}`, '+');
      for (const [id, fields] of entries) {
        const payload = fields[1];
        if (payload !== undefined) writeEvent(res, payload, id);
      }
    } else {
      const exam = await loadParentExamOrThrow(schoolId, examId);
      const snapshot = await computeExamControlSnapshot(schoolId, examId, exam.status, thresholdMs);
      writeEvent(res, JSON.stringify(snapshot));
    }

    let connections = this.connectionsByChannel.get(channel);
    if (!connections) {
      connections = new Set();
      this.connectionsByChannel.set(channel, connections);
      await this.subscriber.subscribe(channel);
    }
    const connection: Connection = {
      res,
      heartbeat: setInterval(() => {
        res.write(': keep-alive\n\n');
      }, HEARTBEAT_INTERVAL_MS),
    };
    connections.add(connection);

    res.on('close', () => {
      this.detach(channel, connection);
    });
  }

  private detach(channel: string, connection: Connection): void {
    clearInterval(connection.heartbeat);
    const connections = this.connectionsByChannel.get(channel);
    if (!connections) return;
    connections.delete(connection);
    if (connections.size === 0) {
      this.connectionsByChannel.delete(channel);
      this.subscriber.unsubscribe(channel).catch((err: unknown) => {
        this.logger.warn(`Failed to unsubscribe from ${channel}: ${String(err)}`);
      });
    }
  }

  /** Called by every mutating service in this module after its transaction
   * commits — recomputes the full current snapshot and: publishes it live
   * (Redis pub/sub fan-out, reaching every API node's own subscribed
   * connections, this process's included), durably appends it to the
   * replay stream (`XADD ... MAXLEN ~`, TTL refreshed on every append), and
   * write-throughs the same payload into the `GET /control` read-cache key
   * (found missing in review: without this, `GET /control` could keep
   * serving the pre-mutation cached snapshot — most importantly a
   * pre-completion one — until the worker's own next sweep tick, or forever
   * once the exam leaves OPEN/CLOSED and the sweep stops touching it at
   * all). The cache write carries the same bounded TTL the worker sweep
   * uses, so a snapshot nothing is refreshing any more naturally expires
   * instead of surviving in Redis indefinitely. */
  async publishUpdate(schoolId: string, examId: string): Promise<void> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const thresholdMs = this.config.get('EXAM_STALENESS_THRESHOLD_MS', { infer: true });
    const snapshot = await computeExamControlSnapshot(schoolId, examId, exam.status, thresholdMs);
    const payload = JSON.stringify(snapshot);
    const channel = examControlChannel(schoolId, examId);
    const streamKey = examControlStreamKey(schoolId, examId);

    await this.redis.set(channel, payload, 'EX', EXAM_CONTROL_CACHE_TTL_SECONDS);
    await this.redis.publish(channel, payload);
    await this.redis.xadd(streamKey, 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'event', payload);
    await this.redis.expire(streamKey, STREAM_TTL_SECONDS);
  }
}
