import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import type { TemplateRegistry } from '@atlas/notifications';
import { NOTIFICATION_TEMPLATE_REGISTRY } from '../../notifications/notifications.module.js';
import { IdentityController } from './identity.controller.js';
import { StudentPasswordlessController } from './student-passwordless.controller.js';
import { StudentPasswordlessService } from './student-passwordless.service.js';
import { IdentityService } from './identity.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { AuthLockoutService } from './auth-lockout.service.js';
import { AuthGuard } from './auth.guard.js';
import { CredentialSheetService } from './credential-sheet.service.js';
import { registerIdentityTemplates } from './templates.js';
import { IdentityAuditActionRegistrationProvider } from './audit-action-registration.provider.js';

/**
 * Bounded domain per 08 §5: "Identity — Users, school memberships, roles,
 * sessions, credentials." B1 (auth.v1 contract); read (never written) by
 * B2's authorization engine.
 *
 * Does NOT import MediaModule, even though `GET /tenant/resolve` (B4)
 * resolves the school's logo to a signed URL — MediaModule's own
 * controllers need AuthGuard (this module), so importing MediaModule here
 * too would create a real circular module dependency. `IdentityController`
 * instead injects `ObjectStorageService` directly (the `@Global()`
 * StorageModule needs no explicit import) and calls the shared
 * `resolveLogoSignedUrl` helper — see that function's own doc comment in
 * `apps/api/src/storage/logo-resolver.ts`.
 */
@Module({
  controllers: [IdentityController, StudentPasswordlessController],
  providers: [
    IdentityService,
    PasswordService,
    SessionService,
    AuthLockoutService,
    AuthGuard,
    CredentialSheetService,
    IdentityAuditActionRegistrationProvider,
    StudentPasswordlessService,
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
  //
  // AuthLockoutService (B3): PlatformAuthService (platform module) reuses
  // this same per-identifier lockout primitive for Software Admin login —
  // it's already keyed by an arbitrary string, not literally a school id,
  // so no change to the service itself, just exporting it.
  //
  // IdentityService (B6): UsersModule calls .issueStaffInvitation() when
  // creating a teacher/HOD/moderator — token creation and NotificationChannel
  // wiring stay centralised here rather than duplicated in UsersModule.
  exports: [
    PasswordService,
    CredentialSheetService,
    AuthGuard,
    SessionService,
    AuthLockoutService,
    IdentityService,
  ],
})
export class IdentityModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REGISTRY) private readonly templates: TemplateRegistry,
  ) {}

  onModuleInit() {
    registerIdentityTemplates(this.templates);
  }
}
