/**
 * B20 operator command — data-subject redaction (ADR-0028; project-owner
 * decision 2026-10-02). Dry-run unless --apply. Prints field NAMES and
 * counts only, never the personal values involved.
 *
 *   pnpm --filter @atlas/api ops:redact-subject -- \
 *     --school <subdomain> --membership <uuid> --actor <softwareAdminUserId> \
 *     --reason "Parent's written request" --request-ref "DSR-2026-014" [--apply]
 *
 * Procedure (who may ask, how identity is verified, response times) is in
 * docs/compliance/data-protection.md.
 */
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import {
  applyRedaction,
  DATA_SUBJECT_REDACTED_ACTION,
  planRedaction,
} from '../modules/operations/subject-redaction.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const subdomain = requireArg(args, 'school');
  const params = {
    membershipId: requireArg(args, 'membership'),
    actorUserId: requireArg(args, 'actor'),
    reason: requireArg(args, 'reason'),
    requestRef: requireArg(args, 'request-ref'),
  };
  await assertSoftwareAdmin(prisma, params.actorUserId);
  const school = await prisma.school.findUnique({ where: { subdomain }, select: { id: true } });
  if (!school) throw new Error(`No school with subdomain "${subdomain}".`);

  const full = { ...params, schoolId: school.id };
  if (args.apply !== true) {
    const plan = await planRedaction(full);
    console.log(JSON.stringify({ mode: 'DRY_RUN', plan }, null, 2));
    console.log('Nothing changed. Re-run with --apply to redact.');
    return;
  }
  const registry = new AuditActionRegistry();
  registry.register(DATA_SUBJECT_REDACTED_ACTION);
  const plan = await applyRedaction(new AuditService(registry), full);
  console.log(JSON.stringify({ mode: 'APPLIED', plan }, null, 2));
}

main()
  .catch((err: unknown) => {
    console.error('[ops:redact-subject] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
