import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TemplateRegistry } from '@atlas/notifications';
import { getProductName, type Env } from '@atlas/config';
import { NOTIFICATION_TEMPLATE_REGISTRY } from '../../notifications/notifications.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { MediaModule } from '../media/media.module.js';
import { PlatformSessionService } from './platform-session.service.js';
import { PlatformAuthGuard } from './platform-auth.guard.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { SchoolsAdminService } from './schools-admin.service.js';
import { SchoolsAdminController } from './schools-admin.controller.js';
import { PlatformMetricsService } from './platform-metrics.service.js';
import { PlatformMetricsController } from './platform-metrics.controller.js';
import { ActivationService } from './activation.service.js';
import { ActivationController } from './activation.controller.js';
import { SchoolProfileService } from './school-profile.service.js';
import { SchoolProfileController } from './school-profile.controller.js';
import { SchoolBrandingService } from './school-branding.service.js';
import { SchoolBrandingController } from './school-branding.controller.js';
import { registerPlatformTemplates } from './templates.js';

/**
 * Bounded domain per 08 §5: "Platform — Software Admin, schools,
 * subscriptions, activation grants." Populated by B3 (previously an empty
 * B0 stub — see this file's own git history via CLAUDE.md's Change Log).
 *
 * `PlatformAuthGuard` and `PlatformSessionService` are declared as ordinary
 * providers here (not exported) — nothing outside this module's own
 * controllers uses `@AuthorizedPlatform(...)`, so unlike IdentityModule's
 * AuthGuard (which AuthorizationController, a *different* module, also
 * needs), there's no cross-module reachability problem to solve.
 * `AuthorizationModule` (PermissionGuard/AuthorizationService),
 * `NotificationsModule`, and `AccessGateModule` (this module's own
 * `AccessGateService` — see that file's doc comment for why it's
 * registered separately rather than in this module's own `providers`) are
 * all `@Global()` — reachable here without an explicit import, the same
 * way IdentityModule's own controller already relies on.
 */
@Module({
  imports: [IdentityModule, OperationsModule, MediaModule],
  controllers: [
    PlatformAuthController,
    SchoolsAdminController,
    PlatformMetricsController,
    ActivationController,
    SchoolProfileController,
    SchoolBrandingController,
  ],
  providers: [
    PlatformSessionService,
    PlatformAuthGuard,
    PlatformAuthService,
    SchoolsAdminService,
    PlatformMetricsService,
    ActivationService,
    SchoolProfileService,
    SchoolBrandingService,
  ],
})
export class PlatformModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REGISTRY) private readonly templates: TemplateRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    const productName = getProductName({
      PRODUCT_NAME: this.config.get('PRODUCT_NAME', { infer: true }),
    });
    registerPlatformTemplates(this.templates, productName);
  }
}
