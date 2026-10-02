/**
 * B20 operator command — last-resort Software Admin MFA reset, for when no
 * other admin can sign in to use POST /v1/platform/auth/mfa/reset (e.g. the
 * only admin lost their device and recovery codes). Audited exactly like
 * the endpoint, as a platform-level event.
 *
 *   pnpm --filter @atlas/api ops:mfa-reset -- \
 *     --target <adminUserId> --actor <operatorAdminUserId> --reason "..." [--apply]
 *
 * --actor may equal --target only here (the break-glass case); the HTTP
 * endpoint refuses self-reset. Requires shell access to a production task,
 * which is itself the control.
 */
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import { PLATFORM_MFA_AUDIT_ACTIONS } from '../modules/platform/mfa/platform-mfa.service.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = requireArg(args, 'target');
  const actor = requireArg(args, 'actor');
  const reason = requireArg(args, 'reason');
  await assertSoftwareAdmin(prisma, actor);
  await assertSoftwareAdmin(prisma, target);

  const enrolled = await prisma.platformMfaCredential.findUnique({ where: { userId: target } });
  if (args.apply !== true) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', target, hasCredential: Boolean(enrolled) }));
    console.log('Nothing changed. Re-run with --apply to reset.');
    return;
  }
  const { count } = await prisma.platformMfaCredential.deleteMany({ where: { userId: target } });
  const { count: revoked } = await prisma.platformSession.updateMany({
    where: { userId: target, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const registry = new AuditActionRegistry();
  registry.registerAll(Object.values(PLATFORM_MFA_AUDIT_ACTIONS));
  await new AuditService(registry).recordPlatform({
    actorUserId: actor,
    actorRole: 'SOFTWARE_ADMIN',
    action: PLATFORM_MFA_AUDIT_ACTIONS.reset,
    entityType: 'User',
    entityId: target,
    reason,
    metadata: { via: 'operator-cli', credentialRemoved: count > 0, sessionsRevoked: revoked },
  });
  console.log(
    JSON.stringify({ mode: 'APPLIED', credentialRemoved: count > 0, sessionsRevoked: revoked }),
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ops:mfa-reset] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
