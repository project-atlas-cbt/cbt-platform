import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';

/** Redis is strictly an expendable projection cache. A version bump changes
 * the namespace rather than attempting unsafe wildcard deletion; clearing
 * Redis therefore simply causes the exact same source queries to run again. */
@Injectable()
export class AnalyticsCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async read<T>(
    schoolId: string,
    audience: string,
    resource: string,
    filters: object,
    compute: () => Promise<T>,
  ): Promise<T> {
    try {
      const version = (await this.redis.get(this.versionKey(schoolId))) ?? '0';
      const digest = createHash('sha256')
        .update(JSON.stringify(filters))
        .digest('hex')
        .slice(0, 16);
      const key = `atlas:analytics:school:${schoolId}:v${version}:audience:${audience}:${resource}:${digest}`;
      const cached = await this.redis.get(key);
      if (cached) {
        try {
          return JSON.parse(cached) as T;
        } catch {
          /* recompute corrupt cache */
        }
      }
      const value = await compute();
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', 300);
      } catch {
        /* cache is optional */
      }
      return value;
    } catch {
      // Redis is a projection cache, never an availability dependency.
      return compute();
    }
  }

  async readPlatform<T>(resource: string, compute: () => Promise<T>): Promise<T> {
    try {
      const key = `atlas:analytics:platform:${resource}`;
      const cached = await this.redis.get(key);
      if (cached) {
        try {
          return JSON.parse(cached) as T;
        } catch {
          /* recompute corrupt cache */
        }
      }
      const value = await compute();
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', 300);
      } catch {
        /* cache is optional */
      }
      return value;
    } catch {
      return compute();
    }
  }

  async invalidateSchool(schoolId: string): Promise<void> {
    try {
      await this.redis.incr(this.versionKey(schoolId));
      await this.redis.del('atlas:analytics:platform:overview');
    } catch {
      // A later source-derived read is still correct when this bump is lost.
    }
  }

  private versionKey(schoolId: string): string {
    return `atlas:analytics:school:${schoolId}:version`;
  }
}
