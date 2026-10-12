import type { NotificationChannel, NotificationMessage } from './channel.js';
import type { TemplateRegistry } from './template.js';

/**
 * ADR-0019's provider decision for B0: a working dev/console transport,
 * not a real email provider. Real provider selection (SES/Postmark) and
 * SPF/DKIM/DMARC configuration are explicitly deferred to B23 by that ADR
 * — this is not a stand-in left unfinished, it's the decided B0 scope.
 *
 * `sink` defaults to console.log but is injectable so callers (and this
 * package's own tests) can capture output instead of writing to real
 * stdout.
 *
 * B20 log hygiene: the rendered body carries live bearer material (reset
 * and activation URLs) and the recipient address is PII, so both are only
 * written when `revealContent` is true — apps/api sets it everywhere except
 * NODE_ENV=production, where a developer or a test needs the link to finish
 * the flow. Anywhere else this logs that a message of a given template was
 * handed off, and nothing more.
 */
export interface ConsoleChannelOptions {
  revealContent?: boolean;
}

export class ConsoleNotificationChannel implements NotificationChannel {
  constructor(
    private readonly templates: TemplateRegistry,
    private readonly sink: (line: string) => void = console.log,
    private readonly options: ConsoleChannelOptions = { revealContent: true },
  ) {}

  send(message: NotificationMessage): Promise<void> {
    // Not `async` (no `await` in the body would trip
    // @typescript-eslint/require-await) — the try/catch below is what
    // turns TemplateRegistry.render()'s synchronous throw into a rejected
    // Promise instead of an exception escaping send() itself, which every
    // NotificationChannel implementation must do consistently so callers
    // can always `await channel.send(...)` and catch failures the same way.
    try {
      const rendered = this.templates.render(message.template, message.variables ?? {});
      if (!this.options.revealContent) {
        this.sink(`[notifications:console] template=${message.template} (content withheld)`);
        return Promise.resolve();
      }
      this.sink(
        [
          `[notifications:console] to=${message.to} template=${message.template}`,
          `  subject: ${rendered.subject}`,
          ...(rendered.attachments?.length
            ? [`  attachments: ${rendered.attachments.map((a) => a.filename).join(', ')}`]
            : []),
          `  ${rendered.text}`,
        ].join('\n'),
      );
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
