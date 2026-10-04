/**
 * B22 (08 §25 "database transient failure: retry safe operations"): tells a
 * dependency being briefly unavailable apart from a bug, so the client gets
 * 503 SERVICE_UNAVAILABLE + Retry-After — which the web client's sync engine
 * and every queue already treat as "try again shortly" — instead of a 500.
 *
 * Classified by the error's own code/name, never by matching on request
 * data. Unknown errors stay 500: a misclassified bug that clients silently
 * retry forever is worse than a visible one.
 */
export type UnavailableDependency = 'database' | 'redis' | 'storage' | 'queue' | 'network';

/** Node socket errors that mean "could not reach / lost the peer". */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** Prisma engine codes for "can't reach / lost / pool exhausted". */
const PRISMA_UNAVAILABLE = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

/** PostgreSQL SQLSTATEs: connection exceptions (class 08), operator
 * intervention (57P01 admin shutdown, 57P02 crash shutdown, 57P03 cannot
 * connect now) and too many connections. */
function isPostgresUnavailableState(code: string): boolean {
  return (
    code.startsWith('08') ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '53300'
  );
}

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  $metadata?: { httpStatusCode?: unknown };
}

export function classifyUnavailable(err: unknown, depth = 0): UnavailableDependency | undefined {
  if (!err || typeof err !== 'object' || depth > 4) return undefined;
  const e = err as ErrorLike;
  const name = typeof e.name === 'string' ? e.name : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';

  if (name === 'DependencyTimeoutError') return 'queue';
  if (name === 'TenantLookupUnavailableError') return 'database';
  if (name === 'PrismaClientInitializationError') return 'database';
  if (name === 'PrismaClientKnownRequestError' && PRISMA_UNAVAILABLE.has(code)) return 'database';
  if (name === 'PrismaClientUnknownRequestError' || name === 'DriverAdapterError') {
    const inner = classifyUnavailable(e.cause, depth + 1);
    if (inner) return inner;
    if (
      /connection (terminated|closed|refused)|terminating connection|Connection terminated/i.test(
        message,
      )
    ) {
      return 'database';
    }
  }
  if (/^[0-9A-Z]{5}$/.test(code) && isPostgresUnavailableState(code)) return 'database';
  if (/Connection terminated|terminating connection due to administrator command/i.test(message)) {
    return 'database';
  }

  // ioredis: per-command timeout, retries exhausted, offline queue off,
  // connection closed.
  if (
    name === 'MaxRetriesPerRequestError' ||
    message === 'Command timed out' ||
    message === 'Connection is closed.' ||
    message.startsWith("Stream isn't writeable")
  ) {
    return 'redis';
  }

  // AWS SDK v3: networking/timeouts and S3 5xx.
  if (name === 'TimeoutError' || name === 'RequestTimeout' || name === 'NetworkingError') {
    return 'storage';
  }
  const status = e.$metadata?.httpStatusCode;
  if (typeof status === 'number' && status >= 500) return 'storage';
  if (name === 'ServiceUnavailable' || name === 'SlowDown' || name === 'InternalError') {
    return 'storage';
  }

  if (NETWORK_CODES.has(code)) return e.$metadata ? 'storage' : 'network';
  return classifyUnavailable(e.cause, depth + 1);
}

/** Seconds the client should wait before retrying a 503 caused by an
 * unavailable dependency — short: most blips are seconds long. */
export const DEPENDENCY_RETRY_AFTER_SECONDS = 5;
