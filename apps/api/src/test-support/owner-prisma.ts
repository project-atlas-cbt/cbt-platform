import { createPrismaClient, type PrismaClient } from '@atlas/db';

/**
 * B20: test fixtures that need privileges the runtime role `atlas_app` no
 * longer has (packages/db/src/privileges.ts) — creating a Software Admin's
 * `platform_role_assignments` row, deleting a fixture school — go through
 * the schema-owner connection (`DATABASE_URL`), exactly as the seed script
 * and operators do. Product code never uses this; it exists so tests don't
 * pressure the least-privilege grants back open.
 *
 * One lazily-created client per test process; callers never disconnect it
 * themselves — `disconnectOwnerPrisma()` from afterAll if they want to.
 */
let owner: PrismaClient | undefined;

export function ownerPrisma(): PrismaClient {
  if (!owner) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL (schema owner) is required for owner-only fixtures.');
    owner = createPrismaClient(url);
  }
  return owner;
}

export async function disconnectOwnerPrisma(): Promise<void> {
  await owner?.$disconnect();
  owner = undefined;
}

/** Grants SOFTWARE_ADMIN to an existing user — the operator-provisioned
 * path, never an application one. */
export async function grantSoftwareAdmin(userId: string): Promise<void> {
  await ownerPrisma().platformRoleAssignment.create({
    data: { userId, role: 'SOFTWARE_ADMIN' },
  });
}

export async function revokeSoftwareAdminFixtures(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  await ownerPrisma()
    .platformRoleAssignment.deleteMany({ where: { userId: { in: [...userIds] } } })
    .catch(() => undefined);
}
