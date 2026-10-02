import { createPrismaClient, type PrismaClient } from '@atlas/db';

/**
 * B10: `AuditEvent` gained an unconditional append-only trigger (any
 * `UPDATE`/`DELETE`, direct or cascaded, is rejected — see the B10
 * migration's own comment). `AuditEvent.schoolId` cascades on
 * `School` deletion, so a plain `prisma.school.delete(...)`/`deleteMany(
 * ...)` teardown now throws for any test fixture school that ever wrote
 * an `AuditEvent` row — which, given ~55 action-emitting call sites across
 * nearly every module, is most integration test files that create a
 * school and exercise real behaviour against it.
 *
 * Every affected file's teardown should call this instead of deleting
 * schools directly. `apps/api/src/**\/*.integration.test.ts` files use a
 * duplicate of this same function at
 * `apps/api/src/test-support/safe-delete-schools.ts` instead of importing
 * this one — `apps/api/tsconfig.json`'s `rootDir: "./src"` means nothing
 * under `apps/api/src` can import from outside it. Best-effort by design: a school (and, transitively,
 * its now-permanently-immutable audit events) that can't be deleted is
 * left behind, harmless — RLS-scoped, uniquely UUID-named per test run,
 * never reachable outside its own deleted-in-name-only school's context.
 * No test in this codebase asserts a school was actually deleted post-
 * teardown (confirmed during B10's own implementation); if one ever does,
 * it needs its own accommodation, not this helper.
 */
export async function safeDeleteSchools(
  prisma: PrismaClient,
  schoolIds: readonly string[],
): Promise<void> {
  if (schoolIds.length === 0) return;
  // B20: atlas_app can no longer DELETE schools (packages/db/src/
  // privileges.ts) — teardown is an owner operation, like provisioning.
  const ownerUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  const owner = ownerUrl ? createPrismaClient(ownerUrl) : prisma;
  try {
    await owner.school.deleteMany({ where: { id: { in: [...schoolIds] } } }).catch(() => undefined);
  } finally {
    if (owner !== prisma) await owner.$disconnect();
  }
}
