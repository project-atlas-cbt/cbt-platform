/**
 * Operator command — emails one operational alert to the operations alert
 * recipients (System Configuration, `OPS_ALERT_EMAILS` by default; ADR-0036)
 * through the NotificationChannel. For host scripts that run outside the
 * worker, such as the nightly backup (audit P0-3): a failure there has no
 * other way to reach a person.
 *
 *   pnpm --filter @atlas/api ops:send-alert -- \
 *     --key backup.failed --title "Nightly backup failed" --summary "..." [--severity warning]
 *
 * Sends directly over the transport rather than through the dispatch queue,
 * so it still works when the API, the worker or Redis is the thing that is
 * down. If the settings table can't be read in a few seconds, the env
 * recipients apply. Exits 1 when no recipient is configured or a send fails.
 */
import { loadEnv, loadRootEnv } from '@atlas/config';
import { createPlatformSettingsReader, prisma } from '@atlas/db';
import {
  OPERATIONAL_ALERT_TEMPLATE,
  TemplateRegistry,
  operationalAlertVariables,
  parseOpsAlertRecipients,
} from '@atlas/notifications';
import { createNotificationChannel } from '../notifications/create-channel.js';
import { parseArgs, requireArg } from './cli-args.js';

loadRootEnv();

const SETTINGS_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const alertKey = requireArg(args, 'key');
  const title = requireArg(args, 'title');
  const summary = requireArg(args, 'summary');
  const severity = args.severity === 'warning' ? 'warning' : 'critical';
  const env = loadEnv();

  const fromSettings = createPlatformSettingsReader(prisma, env, {
    onError: () => console.error('[ops:send-alert] settings unreadable; using env recipients'),
  })
    .get()
    .then((s) => s.values.opsAlertEmails);
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), SETTINGS_TIMEOUT_MS).unref(),
  );
  const recipients =
    (await Promise.race([fromSettings, timeout])) ?? parseOpsAlertRecipients(env.OPS_ALERT_EMAILS);
  if (recipients.length === 0) throw new Error('No operations alert recipient is configured.');

  const templates = new TemplateRegistry();
  templates.register(OPERATIONAL_ALERT_TEMPLATE);
  const channel = createNotificationChannel(env, templates);
  const variables = operationalAlertVariables({
    alertKey,
    severity,
    title,
    summary,
    transition: 'EVENT',
  });
  for (const to of recipients) {
    await channel.send({ to, template: OPERATIONAL_ALERT_TEMPLATE.name, variables });
  }
  console.log(JSON.stringify({ sent: recipients.length, alertKey }));
}

main()
  .catch((err: unknown) => {
    console.error('[ops:send-alert] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
