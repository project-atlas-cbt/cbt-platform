import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ScopeResolverRegistry } from '../authorization/scope-resolvers.js';
import { createDepartmentScopeResolver } from './department-scope.resolver.js';

/** Registers the real DEPARTMENT resolver on boot, keeping
 * `AcademicsModule` itself a plain `@Module` decorator (consistent with
 * every other module in this codebase) rather than growing custom
 * bootstrap logic of its own. */
@Injectable()
export class DepartmentScopeResolverProvider implements OnModuleInit {
  constructor(private readonly registry: ScopeResolverRegistry) {}

  onModuleInit(): void {
    this.registry.register('DEPARTMENT', createDepartmentScopeResolver());
  }
}
