import { Global, Module } from '@nestjs/common';
import { TenancyContextService } from './tenancy-context.service.js';

/**
 * TenancyContextService has to be the exact same singleton everywhere it's
 * injected — TenancyMiddleware populates it, CsrfGuard (security.module.ts)
 * reads it for the userInfo binding, and it's an AsyncLocalStorage-backed
 * request context, not a stateless helper, so two separately-provided
 * instances would silently desync (the guard would always see an empty
 * context). @Global() here is what guarantees a single instance
 * application-wide regardless of which module injects it, the same
 * pattern RedisModule and AppConfigModule already use for their own
 * shared singletons.
 *
 * Extracted out of AppModule (which used to provide it directly) because
 * a plain provider on the root module isn't visible to a *different*
 * module's own providers (SecurityModule's CsrfGuard) unless something
 * exports it into the graph — this is that something.
 */
@Global()
@Module({
  providers: [TenancyContextService],
  exports: [TenancyContextService],
})
export class TenancyModule {}
