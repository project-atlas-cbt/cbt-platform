import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { prisma } from '@atlas/db';
import { PublicRoute } from '../modules/authorization/decorators.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

interface ReadinessCheck {
  name: 'database' | 'redis';
  ok: boolean;
  error?: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

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
    summary: 'Readiness probe — database, Redis, and object storage are reachable.',
  })
  async readiness(@Res({ passthrough: true }) res: FastifyReply) {
    const checks = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const ok = checks.every((c) => c.ok);
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? ('ok' as const) : ('degraded' as const), checks };
  }

  private async checkDatabase(): Promise<ReadinessCheck> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { name: 'database', ok: true };
    } catch (err) {
      return { name: 'database', ok: false, error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<ReadinessCheck> {
    try {
      const pong = await this.redis.ping();
      return { name: 'redis', ok: pong === 'PONG' };
    } catch (err) {
      return { name: 'redis', ok: false, error: (err as Error).message };
    }
  }
}
