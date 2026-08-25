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
 */
export class ConsoleNotificationChannel implements NotificationChannel {
  constructor(
    private readonly templates: TemplateRegistry,
    private readonly sink: (line: string) => void = console.log,
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
      this.sink(
        [
          `[notifications:console] to=${message.to} template=${message.template}`,
          `  subject: ${rendered.subject}`,
          `  ${rendered.text}`,
        ].join('\n'),
      );
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
