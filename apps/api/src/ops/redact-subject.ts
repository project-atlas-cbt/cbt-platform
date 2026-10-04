/**
 * B20 operator command — data-subject redaction (ADR-0028; project-owner
 * decision 2026-10-02). Dry-run unless --apply. Prints field NAMES and
 * counts only, never the personal values involved.
 *
 *   pnpm --filter @atlas/api ops:redact-subject -- \
 *     --school <subdomain> --membership <uuid> --actor <softwareAdminUserId> \
 *     --reason "Parent's written request" --request-ref "DSR-2026-014" [--apply]
 *
 * The reason is kept in the audit trail: never put the person's name in it.
 * The request reference must be a DSR number (DSR-YYYY-NNN).
 *
 * B22 (decision 2b) — after a database restore, re-apply every redaction
 * made since the restore point (the DR runbook's last step):
 *
 *   pnpm --filter @atlas/api ops:redact-subject -- \
 *     --replay --since 2026-10-04T09:00:00Z --actor <softwareAdminUserId> [--apply]
 *
 * Procedure (who may ask, how identity is verified, response times) is in
 * docs/compliance/data-protection.md.
 */
import { loadEnv, loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import {
  applyRedaction,
  DATA_SUBJECT_REDACTED_ACTION,
  planRedaction,
  replayRedactions,
} from '../modules/operations/subject-redaction.js';
import { createObjectStorage } from '../storage/storage.module.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const registry = new AuditActionRegistry();
  registry.register(DATA_SUBJECT_REDACTED_ACTION);
  const audit = new AuditService(registry);
  const storage = createObjectStorage(loadEnv());

  if (args.replay === true) {
    const actorUserId = requireArg(args, 'actor');
    const since = new Date(requireArg(args, 'since'));
    if (Number.isNaN(since.getTime())) throw new Error('--since must be an ISO date-time.');
    await assertSoftwareAdmin(prisma, actorUserId);
    const outcomes = await replayRedactions(
      audit,
      { since, actorUserId, apply: args.apply === true },
      { storage },
    );
    console.log(
      JSON.stringify({ mode: args.apply === true ? 'REPLAYED' : 'DRY_RUN', outcomes }, null, 2),
    );
    if (args.apply !== true) console.log('Nothing changed. Re-run with --apply to re-apply.');
    return;
  }

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
  const plan = await applyRedaction(audit, full, { storage });
  console.log(JSON.stringify({ mode: 'APPLIED', plan }, null, 2));
}

main()
  .catch((err: unknown) => {
    console.error('[ops:redact-subject] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
