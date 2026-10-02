import { createPrismaClient, type PrismaClient } from '@atlas/db';

/**
 * B20: fixture teardown that needs a privilege the runtime role `atlas_app`
 * no longer has (deleting a school — packages/db/src/privileges.ts) goes
 * through the schema-owner connection. Mirrors apps/api's own
 * test-support/owner-prisma.ts (same "convention reuse, not literal code
 * sharing" precedent as safe-delete-schools.ts).
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
