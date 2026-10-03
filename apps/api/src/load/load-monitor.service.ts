import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import {
  monitorEventLoopDelay,
  performance,
  type EventLoopUtilization,
  type IntervalHistogram,
} from 'node:perf_hooks';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { LOAD_SHED_SIGNAL_KEY } from '@atlas/domain';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import type { LoadTier } from './load-tiers.js';

export type ShedLevel = 'none' | 'deferrable' | 'standard';

/** Boot (module loading, JIT warm-up) blocks the loop for hundreds of ms —
 * never a reason to shed. */
const WARMUP_MS = 15_000;
/** One slow second (a GC pause, a large JSON body) is noise; this many
 * consecutive over-threshold 1 s windows is saturation. */
const CONSECUTIVE_WINDOWS = 3;
/** Fewer exam-path requests than this in a 1 s window is too few for a p95. */
const MIN_EXAM_SAMPLES = 20;

export interface LoadSnapshot {
  level: ShedLevel;
  eventLoopP99Ms: number;
  /** Fraction of the last 1 s the event loop was busy (0–1). */
  eventLoopUtilization: number;
  /** p95 of the exam write path over the last 1 s window (0 when too few samples). */
  examP95Ms: number;
  inFlight: number;
  sseConnections: number;
  clusterSignal: boolean;
}

/**
 * B21 (R-12): this API process's saturation picture, evaluated once a
 * second from signals that rise *before* answer saves start failing:
 *
 * - event-loop delay p99 (a CPU-saturated Node process delays every
 *   callback, including the ones holding pooled DB connections — measured
 *   in the B21 baseline as the first thing to go);
 * - concurrent in-flight requests;
 * - exam write-path latency p95 (answer save, heartbeat, events, submit).
 *   Added after the B21 cloud runs: with the database or CPU contended,
 *   requests lengthen while the event loop stays responsive (p99 ~30 ms
 *   while answer-save p95 reached 679 ms under a reporting flood), so the
 *   first two signals never fired. This one measures the thing shedding
 *   exists to protect, and catches a slow database.
 * - event-loop utilisation (the fraction of each second the loop is busy).
 *   Also added after the cloud runs: a CPU-pegged process (a reporting
 *   flood of analytics queries) leaves requests queued in socket buffers
 *   *before* any middleware sees them, so neither delay nor measured
 *   latency rises while clients wait 900 ms. Utilisation does.
 *
 * Tripping either sheds the `deferrable` tier (reporting) for at least
 * LOAD_SHED_HOLD_MS and raises the cluster-wide Redis signal so every API
 * process sheds reporting and the worker pauses non-critical queues. Twice
 * either threshold ("severe") also sheds `standard` (admin CRUD). The
 * `critical` tier — exam execution and sign-in — is never shed.
 */
@Injectable()
export class LoadMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoadMonitorService.name);
  private readonly enabled: boolean;
  private readonly p99ThresholdMs: number;
  private readonly maxInFlight: number;
  private readonly examP95ThresholdMs: number;
  private readonly eluThreshold: number;
  private readonly holdMs: number;
  readonly sseMax: number;
  private readonly instance = `${hostname()}:${process.pid}`;
  private histogram: IntervalHistogram | undefined;
  private timer: NodeJS.Timeout | undefined;
  private ticks = 0;
  private startedAt = 0;
  private overWindows = 0;
  private examOverWindows = 0;
  /** Exam write-path durations (ms) in the current 1 s window. */
  private examWindow: number[] = [];
  private lastExamP95Ms = 0;
  private eluOverWindows = 0;
  private lastElu = 0;
  private eluMark: EventLoopUtilization | undefined;

  private inFlightCount = 0;
  private sseCount = 0;
  private lastP99Ms = 0;
  private shedUntil = 0;
  private severeUntil = 0;
  private clusterSignal = false;
  private lastLevel: ShedLevel = 'none';
  /** In-process BullMQ consumers of reporting work (exports, imports). */
  private readonly deferrableWorkers: {
    name: string;
    pause(doNotWait?: boolean): Promise<void>;
    resume(): void;
  }[] = [];
  private workersPaused = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('LOAD_SHED_ENABLED', { infer: true });
    this.p99ThresholdMs = config.get('LOAD_SHED_EVENT_LOOP_P99_MS', { infer: true });
    this.maxInFlight = config.get('LOAD_SHED_MAX_IN_FLIGHT', { infer: true });
    this.examP95ThresholdMs = config.get('LOAD_SHED_EXAM_P95_MS', { infer: true });
    this.eluThreshold = config.get('LOAD_SHED_ELU', { infer: true });
    this.holdMs = config.get('LOAD_SHED_HOLD_MS', { infer: true });
    this.sseMax = config.get('SSE_MAX_CONNECTIONS_PER_PROCESS', { infer: true });
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.histogram = monitorEventLoopDelay({ resolution: 10 });
    this.histogram.enable();
    this.startedAt = Date.now();
    this.eluMark = performance.eventLoopUtilization();
    this.timer = setInterval(() => this.tick(), 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.histogram?.disable();
  }

  requestStarted(): void {
    this.inFlightCount += 1;
    // In-flight is checked on arrival, not only on the 1 s tick: a burst
    // can arrive entirely inside one tick.
    if (this.enabled && this.inFlightCount > this.maxInFlight)
      this.trip(this.inFlightCount > this.maxInFlight * 2);
  }

  /** `examWriteMs` is set only for exam write-path requests. */
  requestFinished(examWriteMs?: number): void {
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    // Bounded by one window's traffic; a saturated process sees a few
    // hundred per second at most (B21 cloud runs).
    if (examWriteMs !== undefined && this.enabled && this.examWindow.length < 10_000)
      this.examWindow.push(examWriteMs);
  }

  streamOpened(): void {
    this.sseCount += 1;
  }

  streamClosed(): void {
    this.sseCount = Math.max(0, this.sseCount - 1);
  }

  get level(): ShedLevel {
    if (!this.enabled) return 'none';
    const now = Date.now();
    if (now < this.severeUntil) return 'standard';
    if (now < this.shedUntil || this.clusterSignal) return 'deferrable';
    return 'none';
  }

  shouldShed(tier: LoadTier): boolean {
    const level = this.level;
    if (tier === 'critical' || level === 'none') return false;
    return tier === 'deferrable' || level === 'standard';
  }

  /** New Control Center streams are refused while shedding or at the per-process cap. */
  shouldRefuseStream(): boolean {
    return this.level !== 'none' || this.sseCount >= this.sseMax;
  }

  get retryAfterSeconds(): number {
    return Math.ceil(this.holdMs / 1000);
  }

  snapshot(): LoadSnapshot {
    return {
      level: this.level,
      eventLoopP99Ms: this.lastP99Ms,
      eventLoopUtilization: this.lastElu,
      examP95Ms: this.lastExamP95Ms,
      inFlight: this.inFlightCount,
      sseConnections: this.sseCount,
      clusterSignal: this.clusterSignal,
    };
  }

  /**
   * B21: in-process reporting consumers (the export and import workers live
   * inside the API process) stop taking new jobs while this process sheds,
   * so a queued 10,000-row export never competes with answer saves for the
   * same connection pool. Jobs stay queued; nothing is dropped.
   */
  pauseWhileShedding(worker: {
    name: string;
    pause(doNotWait?: boolean): Promise<void>;
    resume(): void;
  }): void {
    this.deferrableWorkers.push(worker);
  }

  /** Test seam: force a level for `ms` without generating real load. */
  forceForTests(level: Exclude<ShedLevel, 'none'>, ms: number): void {
    const until = Date.now() + ms;
    this.shedUntil = until;
    if (level === 'standard') this.severeUntil = until;
  }

  private tick(): void {
    if (!this.histogram) return;
    this.lastP99Ms = Math.round(this.histogram.percentile(99) / 1e6);
    this.histogram.reset();
    const warmedUp = Date.now() - this.startedAt >= WARMUP_MS;
    // Shedding exists to protect exam execution. A busy or blocked process
    // with no exam traffic (one admin opening a school-wide dashboard) has
    // nothing to protect, and shedding there would refuse reporting across
    // the cluster for the hold time — measured in B21 before this guard.
    // So the delay and utilisation signals count only while this process is
    // serving exam writes; the exam-latency signal needs them by definition,
    // and the in-flight signal (bursts) stays unconditional.
    const examActive = this.examWindow.length >= MIN_EXAM_SAMPLES;
    this.overWindows =
      warmedUp && examActive && this.lastP99Ms > this.p99ThresholdMs ? this.overWindows + 1 : 0;
    if (this.overWindows >= CONSECUTIVE_WINDOWS) {
      this.trip(this.lastP99Ms > this.p99ThresholdMs * 2);
    }
    this.lastExamP95Ms = p95(this.examWindow);
    this.examWindow = [];
    this.examOverWindows =
      warmedUp && this.lastExamP95Ms > this.examP95ThresholdMs ? this.examOverWindows + 1 : 0;
    if (this.examOverWindows >= CONSECUTIVE_WINDOWS) {
      this.trip(this.lastExamP95Ms > this.examP95ThresholdMs * 2);
    }
    const mark = performance.eventLoopUtilization();
    this.lastElu =
      Math.round(performance.eventLoopUtilization(mark, this.eluMark).utilization * 100) / 100;
    this.eluMark = mark;
    this.eluOverWindows =
      warmedUp && examActive && this.lastElu > this.eluThreshold ? this.eluOverWindows + 1 : 0;
    // Utilisation cannot exceed 1, so it has no "twice the threshold": it
    // sheds reporting only; severe shedding stays with the other signals.
    if (this.eluOverWindows >= CONSECUTIVE_WINDOWS) this.trip(false);
    if (++this.ticks % 2 === 0) {
      this.redis
        .exists(LOAD_SHED_SIGNAL_KEY)
        .then((n) => {
          this.clusterSignal = n > 0;
        })
        .catch(() => undefined);
    }
    this.reportTransition();
    this.applyWorkerPause();
  }

  private applyWorkerPause(): void {
    const shedding = this.level !== 'none';
    if (shedding === this.workersPaused) return;
    this.workersPaused = shedding;
    for (const worker of this.deferrableWorkers) {
      if (shedding) {
        worker.pause(true).catch(() => undefined);
      } else {
        worker.resume();
      }
    }
  }

  private trip(severe: boolean): void {
    const now = Date.now();
    const wasShedding = now < this.shedUntil;
    this.shedUntil = now + this.holdMs;
    if (severe) this.severeUntil = now + this.holdMs;
    if (!wasShedding) {
      // Raise the cluster-wide signal once per trip (renewed by the next trip).
      this.redis.set(LOAD_SHED_SIGNAL_KEY, this.instance, 'PX', this.holdMs).catch(() => undefined);
    }
    this.reportTransition();
  }

  private reportTransition(): void {
    const level = this.level;
    if (level === this.lastLevel) return;
    // `level` is the logger's own field — reported as shedLevel.
    const { level: shedLevel, ...signals } = this.snapshot();
    if (shedLevel === 'none') {
      this.logger.warn({ msg: 'Load shedding ended', shedLevel, ...signals });
    } else {
      this.logger.warn({
        msg: `Load shedding active: shedding ${shedLevel === 'standard' ? 'standard and deferrable' : 'deferrable (reporting)'} requests`,
        shedLevel,
        ...signals,
      });
    }
    this.lastLevel = level;
  }
}

/** Nearest-rank p95 of a window, 0 when the window is too small to mean anything. */
function p95(values: number[]): number {
  if (values.length < MIN_EXAM_SAMPLES) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]!);
}
