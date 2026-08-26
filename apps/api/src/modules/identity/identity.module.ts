import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import type { TemplateRegistry } from '@atlas/notifications';
import { NOTIFICATION_TEMPLATE_REGISTRY } from '../../notifications/notifications.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { AuthLockoutService } from './auth-lockout.service.js';
import { AuthGuard } from './auth.guard.js';
import { CredentialSheetService } from './credential-sheet.service.js';
import { registerIdentityTemplates } from './templates.js';

/**
 * Bounded domain per 08 §5: "Identity — Users, school memberships, roles,
 * sessions, credentials." B1 (auth.v1 contract); read (never written) by
 * B2's authorization engine.
 */
@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    PasswordService,
    SessionService,
    AuthLockoutService,
    AuthGuard,
    CredentialSheetService,
  ],
  // SessionService is exported alongside AuthGuard (not otherwise part of
  // this module's public surface) because `@UseGuards(AuthGuard)` used
  // from a *different* module (AuthorizationController, B2) makes Nest
  // build an instance-wrapper for AuthGuard scoped to that consuming
  // module's own injector — which only reaches providers this module
  // actually exports, not AuthGuard's own private dependencies. Without
  // this, that cross-module instantiation fails at boot with
  // UnknownDependenciesException even though AuthGuard itself already
  // works fine for every route declared inside this module.
  exports: [PasswordService, CredentialSheetService, AuthGuard, SessionService],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REGISTRY) private readonly templates: TemplateRegistry,
  ) {}

  onModuleInit() {
    registerIdentityTemplates(this.templates);
  }
}
