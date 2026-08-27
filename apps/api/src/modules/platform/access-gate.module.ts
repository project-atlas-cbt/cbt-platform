import { Global, Module } from '@nestjs/common';
import { AccessGateService } from './access-gate.service.js';

/**
 * ADR-0016: "One shared resolution function computes effective access, and
 * every guard calls it." `@Global()` (mirroring TenancyModule/
 * AuthorizationModule/NotificationsModule's own precedent) specifically so
 * `identity/auth.guard.ts`'s `AuthGuard` — which runs on *every*
 * authenticated school-scoped request, not just platform routes — can
 * inject `AccessGateService` directly without `IdentityModule` importing
 * `PlatformModule` (which itself imports `IdentityModule` for
 * `PasswordService`/`AuthLockoutService` — a real import cycle this
 * separate module avoids). `PlatformModule`'s own services keep injecting
 * it exactly as before; only the registration moved here.
 */
@Global()
@Module({
  providers: [AccessGateService],
  exports: [AccessGateService],
})
export class AccessGateModule {}
