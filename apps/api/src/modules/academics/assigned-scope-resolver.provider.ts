import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ScopeResolverRegistry } from '../authorization/scope-resolvers.js';
import { createAssignedScopeResolver } from './assigned-scope.resolver.js';

/** Registers the real ASSIGNED resolver on boot, keeping `AcademicsModule`
 * itself a plain `@Module` decorator — mirrors
 * `DepartmentScopeResolverProvider`'s exact shape. */
@Injectable()
export class AssignedScopeResolverProvider implements OnModuleInit {
  constructor(private readonly registry: ScopeResolverRegistry) {}

  onModuleInit(): void {
    this.registry.register('ASSIGNED', createAssignedScopeResolver());
  }
}
