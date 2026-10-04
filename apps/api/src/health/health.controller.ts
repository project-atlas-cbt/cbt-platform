import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { prisma } from '@atlas/db';
import { withTimeout } from '../common/dependency-health.js';
import { isDraining } from '../common/lifecycle.js';
import { PublicRoute } from '../modules/authorization/decorators.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

/** B20: a public, unauthenticated endpoint reports pass/fail only. The
 * underlying error (which can name hosts, ports, roles or SQL) goes to the
 * structured log, never the response body. */
interface ReadinessCheck {
  name: 'database' | 'redis' | 'storage';
  ok: boolean;
  /** B22: whether this dependency failing takes the process out of rotation. */
  critical: boolean;
}

/** A probe must answer quickly even when a dependency hangs. */
const CHECK_TIMEOUT_MS = 2000;

/**
 * B22 (08 §25, 09 §33, B22 API work "health and readiness endpoints report
 * dependency status accurately for orchestration"):
 *
 * - Liveness touches nothing outside the process, so an orchestrator never
 *   restarts a healthy process because Redis or the database blipped.
 * - Readiness fails only on the database — the system of record every
 *   request needs. Redis and object storage are reported (`degraded`) but
 *   do not fail it: the platform degrades without them, and failing
 *   readiness on every node at once would turn a cache outage into a full
 *   outage behind the load balancer.
 * - During a graceful shutdown readiness reports `draining` (503) so the
 *   load balancer stops routing new requests here while in-flight ones finish.
 * - Both skip the rate limiter: probes must work while Redis is down and
 *   must never consume a client's budget.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: ObjectStorageService,
  ) {}

  @Get()
  @PublicRoute(
    'Liveness/readiness probes are infrastructure-level, unauthenticated by nature (load balancers, orchestrators).',
  )
  @ApiOperation({ summary: 'Liveness probe — the process is up.' })
  liveness() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  @PublicRoute(
    'Liveness/readiness probes are infrastructure-level, unauthenticated by nature (load balancers, orchestrators).',
  )
  @ApiOperation({
    summary:
      'Readiness probe — 503 only when the database is unreachable or the process is draining; Redis and object storage are reported as degraded.',
  })
  async readiness(@Res({ passthrough: true }) res: FastifyReply) {
    const checks = await Promise.all([
      this.check('database', true, () => prisma.$queryRaw`SELECT 1`),
      this.check('redis', false, async () => {
        const pong = await this.redis.ping();
        if (pong !== 'PONG') throw new Error('unexpected PING reply');
      }),
      this.check('storage', false, () => this.storage.ping()),
    ]);
    const draining = isDraining();
    const ready = !draining && checks.every((c) => c.ok || !c.critical);
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    const status = draining
      ? ('draining' as const)
      : !ready
        ? ('unavailable' as const)
        : checks.every((c) => c.ok)
          ? ('ok' as const)
          : ('degraded' as const);
    return { status, checks };
  }

  private async check(
    name: ReadinessCheck['name'],
    critical: boolean,
    probe: () => Promise<unknown>,
  ): Promise<ReadinessCheck> {
    try {
      await withTimeout(probe(), CHECK_TIMEOUT_MS, `readiness ${name}`);
      return { name, ok: true, critical };
    } catch (err) {
      this.logger.error({ msg: `Readiness: ${name} check failed`, err });
      return { name, ok: false, critical };
    }
  }
}
