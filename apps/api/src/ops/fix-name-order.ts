/**
 * One-off repair (owner decision 2026-10-09) for a school whose students
 * were imported in register order: surname in First Name, "First Middle" in
 * Last Name. See `modules/users/name-order-fix.ts` for the rule.
 *
 * 1. Review (changes nothing). Prints a CSV of every student, with what the
 *    fix would write and a note; send it to the school to check. On the VPS
 *    (`--silent` and `-T` keep pnpm's banner and terminal codes out of it):
 *
 *      docker compose --profile ops run --rm -T ops pnpm --silent \
 *        --filter @atlas/api ops:fix-name-order -- --school <subdomain> > review.csv
 *
 * 2. Apply, skipping any Student IDs the school marked wrong (fix those on
 *    the student's edit form instead). Rows not noted OK are never touched:
 *
 *      pnpm --filter @atlas/api ops:fix-name-order -- --school <subdomain> \
 *        --actor <softwareAdminUserId> [--skip "OLA/014,OLA/052"] --apply
 *
 * 3. Undo, if ever needed:
 *
 *      pnpm --filter @atlas/api ops:fix-name-order -- --school <subdomain> \
 *        --actor <softwareAdminUserId> --revert --apply
 *
 * The review CSV holds student names: keep it between the operator and the
 * school. The audit trail records only which students were reordered.
 */
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import {
  NAME_ORDER_FIXED_ACTION,
  NAME_ORDER_REVERTED_ACTION,
  applyNameOrderFix,
  planNameOrderFix,
  revertNameOrderFix,
  type NameOrderProposal,
} from '../modules/users/name-order-fix.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

function csvCell(value: string | null): string {
  const text = value ?? '';
  const guarded = /^[=+\-@]/.test(text) ? `\t${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function reviewCsv(rows: NameOrderProposal[]): string {
  const header = [
    'Student ID',
    'Now: First Name',
    'Now: Last Name',
    'New: Surname',
    'New: First Name',
    'New: Middle Name',
    'Note',
  ];
  const lines = rows.map((r) => [
    r.studentId,
    r.current.firstName,
    r.current.lastName,
    r.proposed?.lastName ?? '',
    r.proposed?.firstName ?? '',
    r.proposed?.middleName ?? '',
    r.note,
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const subdomain = requireArg(args, 'school');
  const school = await prisma.school.findUnique({
    where: { subdomain },
    select: { id: true },
  });
  if (!school) throw new Error(`No school with subdomain "${subdomain}".`);
  const skip = new Set(
    typeof args.skip === 'string'
      ? args.skip
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [],
  );

  if (args.apply !== true) {
    const rows = await planNameOrderFix(school.id, skip);
    process.stdout.write(reviewCsv(rows));
    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.note] = (acc[r.note] ?? 0) + 1;
      return acc;
    }, {});
    console.error(JSON.stringify({ mode: 'REVIEW', students: rows.length, counts }));
    console.error('Nothing changed. Re-run with --actor <id> --apply to write the OK rows.');
    return;
  }

  const actorUserId = requireArg(args, 'actor');
  await assertSoftwareAdmin(prisma, actorUserId);
  const registry = new AuditActionRegistry();
  registry.registerAll([NAME_ORDER_FIXED_ACTION, NAME_ORDER_REVERTED_ACTION]);
  const audit = new AuditService(registry);

  if (args.revert === true) {
    const reverted = await revertNameOrderFix(audit, { schoolId: school.id, actorUserId });
    console.log(JSON.stringify({ mode: 'REVERTED', students: reverted.length }));
    return;
  }
  const applied = await applyNameOrderFix(audit, {
    schoolId: school.id,
    actorUserId,
    skipStudentIds: skip,
  });
  console.log(JSON.stringify({ mode: 'APPLIED', students: applied.length }));
}

main()
  .catch((err: unknown) => {
    console.error('[ops:fix-name-order] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
