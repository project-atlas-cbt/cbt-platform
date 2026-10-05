import { Mail, MessageCircle } from 'lucide-react';
import { productName, supportContacts, type SupportContacts } from '@/lib/help/config';

/**
 * ADR-0035 decision 6: the "Still stuck?" block. Contacts come from
 * configuration; an unset channel is left out, and with neither set the
 * block points the reader to their school admin only.
 */
export function SupportContact({ contacts = supportContacts() }: { contacts?: SupportContacts }) {
  const hasAny = Boolean(contacts.email ?? contacts.whatsapp);
  return (
    <section
      aria-labelledby="help-support-heading"
      className="rounded-md border border-border bg-surface-muted px-4 py-3"
    >
      <h2 id="help-support-heading" className="text-sm font-semibold text-text-primary">
        Still stuck?
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Your school admin manages accounts, classes and subjects.
        {hasAny ? ` For anything else, contact ${productName()} support.` : ''}
      </p>
      {hasAny ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm sm:flex-row sm:gap-6">
          {contacts.email ? (
            <li>
              <a
                href={`mailto:${contacts.email}`}
                className="inline-flex items-center gap-1.5 font-medium break-all text-brand-primary underline-offset-2 hover:underline"
              >
                <Mail className="size-4 shrink-0" aria-hidden />
                {contacts.email}
              </a>
            </li>
          ) : null}
          {contacts.whatsapp && contacts.whatsappHref ? (
            <li>
              <a
                href={contacts.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium break-all text-brand-primary underline-offset-2 hover:underline"
              >
                <MessageCircle className="size-4 shrink-0" aria-hidden />
                WhatsApp {contacts.whatsapp}
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
