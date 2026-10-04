/**
 * B22 operator command — anonymise a RESTORED COPY before anyone outside
 * operations uses it (08 §22). See anonymise-copy.ts for what changes.
 *
 *   pnpm --filter @atlas/api ops:anonymise-copy -- \
 *     --database-url postgresql://atlas@restore-host:5433/atlas_dev --confirm-copy atlas_dev
 *
 * Refuses a URL that points at this environment's own database (DATABASE_URL
 * or DATABASE_APP_URL host, port and name), and requires the copy's
 * database name typed back.
 */
import { loadRootEnv } from '@atlas/config';
import { createPrismaClient } from '@atlas/db';
import { anonymiseCopy } from './anonymise-copy.js';
import { parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

function identity(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = requireArg(args, 'database-url');
  const target = identity(url);
  for (const own of [process.env.DATABASE_URL, process.env.DATABASE_APP_URL]) {
    if (own && identity(own) === target) {
      throw new Error(`Refusing: ${target} is this environment's own database, not a copy.`);
    }
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (requireArg(args, 'confirm-copy') !== name) {
    throw new Error(`--confirm-copy must repeat the copy's database name (${name}).`);
  }
  const db = createPrismaClient(url);
  try {
    console.log(JSON.stringify({ anonymised: target, ...(await anonymiseCopy(db)) }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('[ops:anonymise-copy] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
