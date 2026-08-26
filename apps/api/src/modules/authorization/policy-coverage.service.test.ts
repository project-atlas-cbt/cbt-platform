/**
 * B2 DoD item 2 / Security work: "Default deny: an endpoint without an
 * explicit policy fails closed, enforced by a startup assertion that
 * every route declares one." Proven against a real, minimal Nest
 * application context (NestFactory.createApplicationContext — no HTTP
 * adapter needed, and this project has no @nestjs/testing dependency to
 * add just for this one file), so PolicyCoverageService's
 * OnApplicationBootstrap hook runs exactly as it does for the real app.
 */
import { Controller, Get, Logger, Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicRoute, RequirePermission } from './decorators.js';
import { PolicyCoverageService } from './policy-coverage.service.js';

@Controller('good')
class GoodController {
  @Get()
  @RequirePermission('identity.me.read')
  ok() {
    return 'ok';
  }

  @Get('public')
  @PublicRoute('test fixture')
  pub() {
    return 'ok';
  }

  // Not an HTTP route (no @Get/@Post/etc.) — must never be flagged as a
  // missing policy just because it's a method on a controller class.
  helper() {
    return 'not a route';
  }
}

@Controller('bad')
class BadController {
  @Get()
  forgotten() {
    return 'oops';
  }
}

@Module({
  imports: [DiscoveryModule],
  controllers: [GoodController],
  providers: [PolicyCoverageService],
})
class GoodTestModule {}

@Module({
  imports: [DiscoveryModule],
  controllers: [BadController],
  providers: [PolicyCoverageService],
})
class BadTestModule {}

@Module({
  imports: [DiscoveryModule],
  controllers: [GoodController, BadController],
  providers: [PolicyCoverageService],
})
class MixedTestModule {}

describe('PolicyCoverageService — real app bootstrap', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('boots cleanly when every route declares @RequirePermission or @PublicRoute', async () => {
    const app = await NestFactory.createApplicationContext(GoodTestModule, { logger: false });
    await expect(app.init()).resolves.toBeDefined();
    await app.close();
  });

  it('never flags a plain method that is not an HTTP route handler', async () => {
    // GoodController.helper() has no route decorator — if PolicyCoverageService
    // mistreated it as a route, boot above would already have thrown.
    const app = await NestFactory.createApplicationContext(GoodTestModule, { logger: false });
    const service = app.get(PolicyCoverageService);
    expect(() => service.assertFullCoverage()).not.toThrow();
    await app.close();
  });

  it('fails app boot, naming the offending controller and method, when a route declares neither decorator', async () => {
    await expect(
      NestFactory.createApplicationContext(BadTestModule, { logger: false }),
    ).rejects.toThrow(/BadController\.forgotten/);
  });

  it('a passing controller does not mask a failing one registered alongside it', async () => {
    await expect(
      NestFactory.createApplicationContext(MixedTestModule, { logger: false }),
    ).rejects.toThrow(/BadController\.forgotten/);
  });
});
