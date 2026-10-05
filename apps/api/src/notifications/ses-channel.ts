import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2';
import type {
  NotificationChannel,
  NotificationMessage,
  TemplateRegistry,
} from '@atlas/notifications';

/**
 * B23: ADR-0019's real provider, Amazon SES (owner decision 2026-10-04).
 * Renders through the same TemplateRegistry as the console transport, so
 * call sites and templates are unchanged; only the transport differs.
 *
 * Credentials come from the ECS task role (no keys in configuration); the
 * role may send only from the domain's SES identity. A send failure
 * rejects, which the dispatch queue retries with backoff — nothing here
 * logs the recipient or the body (B20 log hygiene).
 */
export type SendEmail = (input: SendEmailCommandInput) => Promise<unknown>;

export function sesSender(region: string | undefined): SendEmail {
  const client = new SESv2Client({ ...(region ? { region } : {}), maxAttempts: 3 });
  return (input) => client.send(new SendEmailCommand(input));
}

export class SesNotificationChannel implements NotificationChannel {
  constructor(
    private readonly templates: TemplateRegistry,
    /** ADR-0036: resolved per message, so a System Configuration change
     * to the sender applies without a restart. */
    private readonly from: string | (() => Promise<string>),
    private readonly sendEmail: SendEmail,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const rendered = this.templates.render(message.template, message.variables ?? {});
    const from = typeof this.from === 'string' ? this.from : await this.from();
    await this.sendEmail({
      FromEmailAddress: from,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: rendered.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: rendered.text, Charset: 'UTF-8' },
            ...(rendered.html !== undefined && {
              Html: { Data: rendered.html, Charset: 'UTF-8' },
            }),
          },
        },
      },
      // Lets SES events (bounces, complaints) be filtered per template.
      EmailTags: [{ Name: 'template', Value: message.template.replace(/[^\w-]/g, '_') }],
    });
  }
}
