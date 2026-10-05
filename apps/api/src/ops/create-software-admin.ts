/**
 * B23 operator command — provision a Software Admin account in a deployed
 * environment. Nothing in the product creates platform accounts (ADR-0012;
 * B20 made platform_role_assignments writable only by the schema owner), and
 * the seed's fixed password is for development only.
 *
 *   pnpm --filter @atlas/api ops:create-software-admin -- \
 *     --email ops@example.ng --first Ada --last Obi --reason "launch operator" \
 *     [--actor <existing admin id>] [--apply]
 *
 * The password is generated here and sent only to the new admin's address
 * through the NotificationChannel (SES or SMTP in production) — never printed or
 * logged (B20). Software Admin MFA is required in production, so the
 * account is enrolled at first sign-in before it can do anything. Runs as
 * the ops task (the only task with the owner password); the first account
 * names itself as actor, every later one names an existing admin.
 * docs/operations/operator-access.md.
 */
import { randomInt } from 'node:crypto';
import { loadEnv, loadRootEnv } from '@atlas/config';
import { createPrismaClient, prisma } from '@atlas/db';
import { TemplateRegistry } from '@atlas/notifications';
import { PasswordService } from '../modules/identity/password.service.js';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import { createNotificationChannel } from '../notifications/create-channel.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

export const SOFTWARE_ADMIN_CREATED = 'PLATFORM_SOFTWARE_ADMIN_CREATED';
export const SOFTWARE_ADMIN_INVITATION_TEMPLATE = {
  name: 'platform.software-admin-invitation',
  subject: 'Your {{productName}} platform account',
  text: [
    'A Software Admin account on {{productName}} has been created for this address.',
    '',
    'Sign in at {{signInUrl}} with this email address and the temporary password below.',
    'You will set up two-factor authentication before you can do anything else.',
    '',
    'Temporary password: {{password}}',
    '',
    'If you did not expect this, tell the platform owner at once.',
  ].join('\n'),
};

/** 24 characters from an unambiguous alphabet, from a CSPRNG. */
export function generateAdminPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

async function main(): Promise<void> {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const email = requireArg(args, 'email').toLowerCase();
  const firstName = requireArg(args, 'first');
  const lastName = requireArg(args, 'last');
  const reason = requireArg(args, 'reason');
  const actor = typeof args.actor === 'string' ? args.actor : undefined;
  if (!env.DATABASE_URL)
    throw new Error('Needs the schema owner connection (run as the ops task).');
  const owner = createPrismaClient(env.DATABASE_URL);

  try {
    const anyAdmin = await owner.platformRoleAssignment.count({ where: { status: 'ACTIVE' } });
    if (anyAdmin > 0 && !actor) {
      throw new Error('Software Admins exist: name the operator creating this one with --actor.');
    }
    if (actor) await assertSoftwareAdmin(owner, actor);
    if (await owner.user.findFirst({ where: { email }, select: { id: true } })) {
      throw new Error('A user with that email already exists; nothing changed.');
    }
    if (args.apply !== true) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', email, firstAdmin: anyAdmin === 0 }));
      console.log('Nothing changed. Re-run with --apply to create the account and email it.');
      return;
    }

    const password = generateAdminPassword();
    const admin = await owner.user.create({
      data: {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        email,
        passwordHash: await new PasswordService().hash(password),
        status: 'ACTIVE',
        credentialState: 'OK',
        platformRoleAssignments: { create: { role: 'SOFTWARE_ADMIN' } },
      },
      select: { id: true },
    });

    const registry = new AuditActionRegistry();
    registry.registerAll([SOFTWARE_ADMIN_CREATED]);
    await new AuditService(registry).recordPlatform({
      actorUserId: actor ?? admin.id,
      actorRole: 'SOFTWARE_ADMIN',
      action: SOFTWARE_ADMIN_CREATED,
      entityType: 'User',
      entityId: admin.id,
      reason,
      metadata: { via: 'operator-cli', firstAdmin: anyAdmin === 0 },
    });

    const templates = new TemplateRegistry();
    templates.register(SOFTWARE_ADMIN_INVITATION_TEMPLATE);
    await createNotificationChannel(env, templates).send({
      to: email,
      template: SOFTWARE_ADMIN_INVITATION_TEMPLATE.name,
      variables: {
        productName: env.PRODUCT_NAME,
        signInUrl: `https://admin.${env.PLATFORM_ROOT_DOMAIN}`,
        password,
      },
    });
    console.log(JSON.stringify({ mode: 'APPLIED', userId: admin.id, emailed: true }));
  } finally {
    await owner.$disconnect();
  }
}

main()
  .catch((err: unknown) => {
    console.error('[ops:create-software-admin] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
