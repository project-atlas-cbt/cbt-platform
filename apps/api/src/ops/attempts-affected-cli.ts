/**
 * B22 operator command — after a point-in-time restore, list the attempts
 * the rollback touched (see attempts-affected.ts), by id, for each school
 * to act on. Read-only on both databases.
 *
 *   pnpm --filter @atlas/api ops:attempts-affected -- \
 *     --old-url <owner url of the pre-restore instance> --restored-url <owner url of the restore>
 *
 * Output: JSON, grouped by school, ids only (no names) — the school looks
 * the students up in its own console.
 */
import { loadRootEnv } from '@atlas/config';
import { createPrismaClient } from '@atlas/db';
import { diffAttempts, fingerprintAttempts, type AffectedAttempt } from './attempts-affected.js';
import { parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const old = createPrismaClient(requireArg(args, 'old-url'));
  const restored = createPrismaClient(requireArg(args, 'restored-url'));
  try {
    const affected = diffAttempts(
      await fingerprintAttempts(old),
      await fingerprintAttempts(restored),
    );
    const bySchool: Record<string, AffectedAttempt[]> = {};
    for (const a of affected) (bySchool[a.schoolId] ??= []).push(a);
    const counts: Record<string, number> = {};
    for (const a of affected) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    console.log(JSON.stringify({ total: affected.length, counts, bySchool }, null, 2));
  } finally {
    await Promise.all([old.$disconnect(), restored.$disconnect()]);
  }
}

main().catch((err: unknown) => {
  console.error('[ops:attempts-affected] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
