import { RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PUBLIC_ROUTE_KEY, REQUIRE_PERMISSION_KEY } from '../modules/authorization/decorators.js';
import { PlatformAuthGuard } from '../modules/platform/platform-auth.guard.js';
import { AuthGuard } from '../modules/identity/auth.guard.js';

/**
 * B20 security suites: every HTTP route the running app exposes, read from
 * the same Nest metadata `PolicyCoverageService` asserts on at boot — so a
 * route added in any later phase is in the tenant-isolation and
 * privilege-escalation suites automatically, with no list to maintain.
 */
export type RouteAuthKind = 'SCHOOL' | 'PLATFORM' | 'PUBLIC';

export interface RouteDescriptor {
  controller: string;
  handler: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Without the global /v1 prefix — test harnesses boot AppModule bare. */
  path: string;
  params: string[];
  permissionId: string | null;
  auth: RouteAuthKind;
}

const METHOD_NAMES: Partial<Record<RequestMethod, RouteDescriptor['method']>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

function joinPath(...parts: Array<string | string[] | undefined>): string {
  const segs = parts
    .flatMap((p) => (Array.isArray(p) ? p.slice(0, 1) : [p]))
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => p.replace(/^\/+|\/+$/gu, ''))
    .filter((p) => p.length > 0);
  return `/${segs.join('/')}`;
}

export function listRoutes(app: NestFastifyApplication): RouteDescriptor[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const routes: RouteDescriptor[] = [];

  for (const wrapper of discovery.getControllers()) {
    const instance: unknown = wrapper.instance;
    const metatype = wrapper.metatype as (abstract new (...args: never[]) => unknown) | undefined;
    if (!instance || typeof metatype !== 'function') continue;
    const controllerPath = Reflect.getMetadata('path', metatype) as string | string[] | undefined;
    const prototype = Object.getPrototypeOf(instance) as object;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const methodPath = Reflect.getMetadata('path', handler) as string | string[] | undefined;
      if (methodPath === undefined) continue;
      const method = METHOD_NAMES[Reflect.getMetadata('method', handler) as RequestMethod];
      if (!method) continue;

      const guards = (Reflect.getMetadata('__guards__', handler) ?? []) as unknown[];
      const auth: RouteAuthKind = guards.includes(PlatformAuthGuard)
        ? 'PLATFORM'
        : guards.includes(AuthGuard)
          ? 'SCHOOL'
          : 'PUBLIC';
      const path = joinPath(controllerPath, methodPath);
      routes.push({
        controller: metatype.name,
        handler: name,
        method,
        path,
        params: [...path.matchAll(/:([A-Za-z]+)/gu)].map((m) => m[1]!),
        permissionId:
          (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler) as string | undefined) ?? null,
        auth: Reflect.getMetadata(PUBLIC_ROUTE_KEY, handler) !== undefined ? 'PUBLIC' : auth,
      });
    }
  }
  return routes;
}

export function fillPath(route: RouteDescriptor, value: (param: string) => string): string {
  return route.path.replace(/:([A-Za-z]+)/gu, (_m, p: string) => encodeURIComponent(value(p)));
}

export const routeLabel = (r: RouteDescriptor) =>
  `${r.method} ${r.path} (${r.controller}.${r.handler})`;
