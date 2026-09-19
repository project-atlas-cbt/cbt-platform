import type { Prisma, PrismaClient } from '../generated/client/index.js';

/**
 * ADR-0023: Row-Level Security is enforced against a session-scoped tenant
 * variable, `app.current_school_id`, set per request and per background
 * job — never trusted from application-level filtering alone.
 *
 * `set_config(..., true)` scopes the setting to the current transaction
 * (`SET LOCAL` semantics) rather than the whole session, which is what
 * makes this safe under connection pooling: the value cannot leak onto the
 * next request that happens to reuse the same pooled connection, because
 * it is cleared automatically at COMMIT/ROLLBACK. See ADR-0023
 * "Connection pooling must not leak session variables between requests"
 * and ADR-0032 (pooler introduced in B21).
 */
export const TENANT_SESSION_VARIABLE = 'app.current_school_id';

// The Prisma interactive-transaction default only waits two seconds for a
// pooled connection. Background sweeps legitimately create many short,
// serial tenant transactions; during an API burst that default turns a
// recoverable wait into P2028. These bounds preserve failure behavior for a
// genuinely exhausted pool while allowing normal queue contention to drain.
const TENANT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTenantContextError extends Error {
  constructor(schoolId: string) {
    super(`"${schoolId}" is not a valid school id (expected a UUID).`);
    this.name = 'InvalidTenantContextError';
  }
}

/**
 * Runs `fn` inside a transaction with the tenant session variable set, so
 * every RLS-protected table is scoped to `schoolId` for the duration —
 * including tables the query forgot to filter explicitly.
 *
 * This is the primitive the request-scoped tenancy middleware (apps/api)
 * and the per-job tenant context (apps/worker) both call into; neither
 * should set the session variable by any other path.
 */
export async function withTenant<T>(
  client: PrismaClient,
  schoolId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(schoolId)) {
    throw new InvalidTenantContextError(schoolId);
  }
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${TENANT_SESSION_VARIABLE}, ${schoolId}, true)`;
    return fn(tx);
  }, TENANT_TRANSACTION_OPTIONS);
}

// Deliberately no withPlatformBreakGlass() here. Software Admin cross-tenant
// access (ADR-0012) needs a real bypass mechanism — e.g. a second session
// variable the RLS policy ORs against, set only via an authorized, audited
// call path — plus the authorization check and the audit log entry around
// every call site. That's B2's authorization engine, not a B0 primitive.
// An earlier version of this file had a same-shaped function that only
// *looked* like a bypass: it set the tenant variable to '', which the
// policy in the rls_bootstrap migration (school_id::text = current_setting
// (...)) never matches — so it silently returned zero rows instead of
// bypassing anything. Caught before B0 shipped it; noted here so B2 doesn't
// reintroduce the same mistake under the same name.
