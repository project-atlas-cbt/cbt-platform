/**
 * B22 operator command — post-restore data-integrity checks (DoD 10). Run
 * against a restored copy before it is trusted; exits 1 on any error-level
 * finding. See restore-verification.ts for what is checked.
 *
 *   pnpm --filter @atlas/api ops:restore-verify -- --database-url <owner url of the copy>
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadRootEnv } from '@atlas/config';
import { createPrismaClient } from '@atlas/db';
import { parseArgs } from './cli-args.js';
import { verifyRestoredDatabase } from './restore-verification.js';

loadRootEnv();

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'prisma',
  'migrations',
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url =
    typeof args['database-url'] === 'string' ? args['database-url'] : process.env.DATABASE_URL;
  if (!url) throw new Error('--database-url (or DATABASE_URL) is required.');
  const expectedMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  ).length;
  const db = createPrismaClient(url);
  try {
    const result = await verifyRestoredDatabase(db, { expectedMigrations });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('[ops:restore-verify] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
