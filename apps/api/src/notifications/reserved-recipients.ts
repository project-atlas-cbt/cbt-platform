import type { NotificationChannel, NotificationMessage } from '@atlas/notifications';

/**
 * Names reserved for documentation and testing (RFC 2606, RFC 6761). No mail
 * to them can ever be delivered, so a real transport sending it only earns
 * bounces, which cost a new sending domain its reputation. The demo school
 * and the load tools give their fictional staff such addresses
 * (`@oakridge.example`), and they run on the pilot server before the pilot.
 */
const RESERVED_TLDS = new Set(['example', 'invalid', 'test', 'localhost']);
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);

export function isReservedRecipient(address: string): boolean {
  const domain = address
    .slice(address.lastIndexOf('@') + 1)
    .toLowerCase()
    .replace(/\.$/, '');
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (RESERVED_TLDS.has(tld)) return true;
  return [...RESERVED_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Wraps a real transport so messages to reserved names are dropped, not sent. */
export class SkipReservedRecipients implements NotificationChannel {
  constructor(private readonly inner: NotificationChannel) {}

  async send(message: NotificationMessage): Promise<void> {
    if (isReservedRecipient(message.to)) return;
    await this.inner.send(message);
  }
}
