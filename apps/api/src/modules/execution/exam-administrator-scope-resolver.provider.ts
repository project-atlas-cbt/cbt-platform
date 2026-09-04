import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ScopeResolverRegistry } from '../authorization/scope-resolvers.js';
import { createExamAdministratorAwareOwnedResolver } from './exam-administrator-scope.resolver.js';

/** Registers the `ExamAdministrator`-aware `OWNED` resolver on boot — mirrors
 * `DepartmentScopeResolverProvider`'s own established shape exactly, keeping
 * `ExamControlModule` itself a plain `@Module` decorator. */
@Injectable()
export class ExamAdministratorScopeResolverProvider implements OnModuleInit {
  constructor(private readonly registry: ScopeResolverRegistry) {}

  onModuleInit(): void {
    this.registry.register('OWNED', createExamAdministratorAwareOwnedResolver());
  }
}
