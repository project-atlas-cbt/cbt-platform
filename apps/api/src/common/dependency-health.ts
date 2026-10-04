import { Injectable, Logger } from '@nestjs/common';
import { recordDependencyFallback, type DegradedDependency } from '@atlas/observability';

const LOG_EVERY_MS = 30_000;
/** While degraded, one call every this-many ms still goes to the
 * dependency to find out whether it is back; the rest skip straight to
 * their fallback instead of each waiting out a timeout. */
const PROBE_INTERVAL_MS = 2_000;

interface DegradedState {
  since: number;
  lastLoggedAt: number;
  lastProbeAt: number;
  fallbacks: number;
}

/**
 * B22 (08 §25, 09 §33): one place every non-critical dependency reports a
 * failed call and a recovered one, so a Redis or object-storage outage is
 * visible — a warning when the process enters degraded mode, a reminder
 * every 30 s while it lasts, an info line with the duration when it ends,
 * and the `atlas.dependency.fallback` counter on every fallback — while the
 * request that hit it carries on. Readiness reports the same state.
 *
 * Process-local on purpose: it describes what THIS process is experiencing,
 * which is what an orchestrator probing this process needs to know.
 */
@Injectable()
export class DependencyHealth {
  private readonly logger = new Logger('DependencyHealth');
  private readonly degraded = new Map<DegradedDependency, DegradedState>();

  /** A call to `dependency` failed and `component` fell back. */
  fellBack(dependency: DegradedDependency, component: string, err?: unknown): void {
    recordDependencyFallback(dependency, component);
    const now = Date.now();
    const state = this.degraded.get(dependency);
    if (!state) {
      this.degraded.set(dependency, {
        since: now,
        lastLoggedAt: now,
        lastProbeAt: now,
        fallbacks: 1,
      });
      this.logger.warn({
        msg: `${dependency} unavailable — degraded mode`,
        dependency,
        component,
        err: errorSummary(err),
      });
      return;
    }
    state.fallbacks += 1;
    if (now - state.lastLoggedAt >= LOG_EVERY_MS) {
      state.lastLoggedAt = now;
      this.logger.warn({
        msg: `${dependency} still unavailable`,
        dependency,
        degradedForMs: now - state.since,
        fallbacks: state.fallbacks,
      });
    }
  }

  /** A call to `dependency` succeeded. Cheap when nothing was degraded. */
  succeeded(dependency: DegradedDependency): void {
    const state = this.degraded.get(dependency);
    if (!state) return;
    this.degraded.delete(dependency);
    this.logger.log({
      msg: `${dependency} recovered`,
      dependency,
      degradedForMs: Date.now() - state.since,
      fallbacks: state.fallbacks,
    });
  }

  /**
   * Whether a caller should call the dependency now. Always true while it
   * is healthy. While degraded (a circuit breaker, half-open every
   * PROBE_INTERVAL_MS) only one probe call per interval goes through; the
   * caller skips straight to its fallback otherwise — one request waiting
   * out a timeout per interval, not every request.
   */
  shouldTry(dependency: DegradedDependency): boolean {
    const state = this.degraded.get(dependency);
    if (!state) return true;
    const now = Date.now();
    if (now - state.lastProbeAt < PROBE_INTERVAL_MS) return false;
    state.lastProbeAt = now;
    return true;
  }

  /** The caller skipped the dependency (see shouldTry) and fell back. */
  skipped(dependency: DegradedDependency, component: string): void {
    recordDependencyFallback(dependency, component);
    const state = this.degraded.get(dependency);
    if (state) state.fallbacks += 1;
  }

  isDegraded(dependency: DegradedDependency): boolean {
    return this.degraded.has(dependency);
  }
}

/** Error class and message only: a dependency error never carries request
 * data, but the stack adds nothing to an outage log line. */
function errorSummary(err: unknown): string | undefined {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err === undefined) return undefined;
  return typeof err === 'string' ? err : 'non-Error value';
}

/** Bounds a promise that may hang on an unavailable dependency. The
 * underlying operation is not cancelled; callers only use this where a late
 * completion is harmless (stable job ids, idempotent writes). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DependencyTimeoutError(what, ms)), ms);
    timer.unref();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class DependencyTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not complete within ${ms} ms`);
    this.name = 'DependencyTimeoutError';
  }
}
