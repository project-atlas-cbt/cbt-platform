import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

/**
 * Bounded infrastructure, not one of `08 §5`'s nine listed domains — `07
 * §11.3`/`09 §22`'s generic MediaAsset upload/validate/sign pipeline is
 * shared by more than one domain (Branding today, Questions from B8
 * onward) and belongs to neither exclusively, the same shape of decision
 * as OperationsModule owning cross-cutting Audit/Notifications. Imported
 * by PlatformModule (to attach a validated asset as a school's logo) and
 * IdentityModule (to resolve the logo's signed URL for the public `GET
 * /v1/tenant/resolve`) — never the other way around, so this module has
 * no dependency on either.
 *
 * Imports IdentityModule for `@Authorized(...)`'s underlying `AuthGuard`
 * (`MediaController`'s routes are school-scoped, per B2's own precedent —
 * see `PlatformModule`'s identical import). Does not create a cycle:
 * IdentityModule does not import this module (see
 * `apps/api/src/storage/logo-resolver.ts`'s doc comment for why).
 *
 * Logo upload/attach deliberately does NOT live here — `PUT /v1/school/
 * branding` and its logo upload-target/complete pair live in
 * school-branding.controller.ts (the `platform` module), gated by
 * `schoolConfig.logo.upload`/`schoolConfig.colour.set` rather than this
 * module's `media.upload`/`media.view`. One controller method can't
 * cleanly enforce two different permission rows depending on request
 * body content (`type: SCHOOL_LOGO` vs everything else) under this
 * codebase's `@Authorized(single-id)` decorator model, so the two paths
 * are split into separate routes instead — both call into `MediaService`
 * for the actual upload/validate/sign mechanics.
 */
@Module({
  imports: [StorageModule, IdentityModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
