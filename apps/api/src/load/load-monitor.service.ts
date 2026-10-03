import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
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

export interface LoadSnapshot {
  level: ShedLevel;
  eventLoopP99Ms: number;
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
 * - concurrent in-flight requests.
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
  private readonly holdMs: number;
  readonly sseMax: number;
  private readonly instance = `${hostname()}:${process.pid}`;
  private histogram: IntervalHistogram | undefined;
  private timer: NodeJS.Timeout | undefined;
  private ticks = 0;
  private startedAt = 0;
  private overWindows = 0;

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
    this.holdMs = config.get('LOAD_SHED_HOLD_MS', { infer: true });
    this.sseMax = config.get('SSE_MAX_CONNECTIONS_PER_PROCESS', { infer: true });
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.histogram = monitorEventLoopDelay({ resolution: 10 });
    this.histogram.enable();
    this.startedAt = Date.now();
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

  requestFinished(): void {
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
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
    this.overWindows = warmedUp && this.lastP99Ms > this.p99ThresholdMs ? this.overWindows + 1 : 0;
    if (this.overWindows >= CONSECUTIVE_WINDOWS) {
      this.trip(this.lastP99Ms > this.p99ThresholdMs * 2);
    }
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
