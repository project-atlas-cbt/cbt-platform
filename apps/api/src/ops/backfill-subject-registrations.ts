/**
 * One-off repair for students enrolled (by hand or by bulk import) before a
 * subject was offered to their class. Until the ClassSubjectService fix,
 * adding the offering afterwards registered nobody, so those students were
 * not eligible for the subject's exams. This registers every ACTIVE
 * enrollment for every ACTIVE offering of its class, the same rule enrolling
 * applies (ADR-0011). Existing rows are left alone whatever their status, so
 * a Moderator's deregistration from an elective stands.
 *
 *   pnpm --filter @atlas/api ops:backfill-subject-registrations -- \
 *     [--school <subdomain>] [--apply]
 *
 * Without --apply it is a dry run: each school's writes are rolled back and
 * only the counts are printed. Ids and counts only, no names.
 */
import { loadRootEnv } from '@atlas/config';
import { prisma, withTenant } from '@atlas/db';
import { registerEnrolledStudentsForOfferings } from '../modules/academics/subject-registration-sync.util.js';
import { parseArgs } from './cli-args.js';

loadRootEnv();

class DryRunRollback extends Error {
  constructor(readonly created: number) {
    super('dry run');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const subdomain = typeof args.school === 'string' ? args.school.trim() : undefined;

  const schools = await prisma.school.findMany({
    where: subdomain ? { subdomain } : {},
    select: { id: true, subdomain: true },
    orderBy: { subdomain: 'asc' },
  });
  if (subdomain && schools.length === 0)
    throw new Error(`No school with subdomain "${subdomain}".`);

  const results: { school: string; schoolId: string; registrationsCreated: number }[] = [];
  for (const school of schools) {
    let created: number;
    try {
      created = await withTenant(prisma, school.id, async (tx) => {
        const count = await registerEnrolledStudentsForOfferings(tx, school.id);
        if (!apply) throw new DryRunRollback(count);
        return count;
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
      created = err.created;
    }
    results.push({ school: school.subdomain, schoolId: school.id, registrationsCreated: created });
  }

  const total = results.reduce((sum, r) => sum + r.registrationsCreated, 0);
  console.log(JSON.stringify({ mode: apply ? 'APPLIED' : 'DRY_RUN', total, results }, null, 2));
  if (!apply) console.log('Nothing changed. Re-run with --apply to write these registrations.');
}

main()
  .catch((err: unknown) => {
    console.error(
      '[ops:backfill-subject-registrations] failed:',
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
