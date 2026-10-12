import { createTransport } from 'nodemailer';
import type {
  NotificationChannel,
  NotificationMessage,
  TemplateRegistry,
} from '@atlas/notifications';

/**
 * VPS pilot (ADR-0019 amendment, 2026-10-04): plain SMTP, for a provider
 * such as Brevo or Resend when the platform does not run on AWS. Renders
 * through the same TemplateRegistry as every other transport, so call sites
 * and templates are unchanged.
 *
 * TLS is required: port 465 uses implicit TLS, any other port must upgrade
 * with STARTTLS (`requireTLS`), so credentials never cross the network in
 * clear. A send failure rejects, which the dispatch queue retries with
 * backoff; nothing here logs the recipient or the body (B20 log hygiene).
 */
export interface SmtpMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Contents are never logged (B20); see TemplateAttachment for the caps. */
  attachments?: { filename: string; contentType: string; content: Uint8Array }[];
}

export type SendMail = (mail: SmtpMail) => Promise<unknown>;

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
}

export function smtpSender(settings: SmtpSettings): SendMail {
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return ({ attachments, ...mail }) =>
    transport.sendMail({
      ...mail,
      // Nodemailer types its attachment content as a Buffer.
      ...(attachments && {
        attachments: attachments.map((a) => ({ ...a, content: Buffer.from(a.content) })),
      }),
    });
}

export class SmtpNotificationChannel implements NotificationChannel {
  constructor(
    private readonly templates: TemplateRegistry,
    /** ADR-0036: resolved per message, so a System Configuration change
     * to the sender applies without a restart. */
    private readonly from: string | (() => Promise<string>),
    private readonly sendMail: SendMail,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const rendered = this.templates.render(message.template, message.variables ?? {});
    const from = typeof this.from === 'string' ? this.from : await this.from();
    await this.sendMail({
      from: from,
      to: message.to,
      subject: rendered.subject,
      text: rendered.text,
      ...(rendered.html !== undefined && { html: rendered.html }),
      ...(rendered.attachments?.length && {
        attachments: rendered.attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: a.content,
        })),
      }),
    });
  }
}
