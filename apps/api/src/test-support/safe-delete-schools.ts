import { ownerPrisma } from './owner-prisma.js';
import type { PrismaClient } from '@atlas/db';

/**
 * B10: `AuditEvent` gained an unconditional append-only trigger (any
 * `UPDATE`/`DELETE`, direct or cascaded, is rejected — see the B10
 * migration's own comment). `AuditEvent.schoolId` cascades on `School`
 * deletion, so a plain `prisma.school.delete(...)`/`deleteMany(...)`
 * teardown now throws for any test fixture school that ever wrote an
 * `AuditEvent` row — which, given ~55 action-emitting call sites across
 * nearly every module, is most integration test files in this app that
 * create a school and exercise real behaviour against it.
 *
 * Every affected `apps/api/src/**\/*.integration.test.ts` file's teardown
 * should call this instead of deleting schools directly. A duplicate of
 * `tests/support/safe-delete-schools.ts`, not a shared import — `tsconfig
 * .json`'s `rootDir: "./src"` means nothing under `apps/api/src` can
 * import from outside it (confirmed: `tests/support/run-prisma.ts` itself
 * is only ever imported from `tests/` files, never from here) — same
 * "convention reuse, not literal code sharing" precedent this codebase
 * already established for `apps/worker`'s own duplicated notification
 * template content.
 *
 * Best-effort by design: a school (and, transitively, its now-permanently-
 * immutable audit events) that can't be deleted is left behind, harmless —
 * RLS-scoped, uniquely UUID-named per test run, never reachable outside
 * its own deleted-in-name-only school's context. No test in this codebase
 * asserts a school was actually deleted post-teardown (confirmed during
 * B10's own implementation); if one ever does, it needs its own
 * accommodation, not this helper.
 */
export async function safeDeleteSchools(
  prisma: PrismaClient,
  schoolIds: readonly string[],
): Promise<void> {
  if (schoolIds.length === 0) return;
  // B20: atlas_app can no longer DELETE schools (packages/db/src/
  // privileges.ts) — teardown is an owner operation, like provisioning.
  // `prisma` stays in the signature so every existing call site is unchanged.
  void prisma;
  await ownerPrisma()
    .school.deleteMany({ where: { id: { in: [...schoolIds] } } })
    .catch(() => undefined);
}
