import type { Metadata } from 'next';
import { ButtonLink, PageHeader } from '@/components/ui';
import { site, whatsappLink } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Number not sent',
  robots: { index: false },
};

export default function CallBackNotSentPage() {
  const whatsapp = whatsappLink(site, `Hello, I'd like to know more about ${site.name}.`);
  return (
    <PageHeader
      eyebrow="Number not sent"
      title="Your number didn’t reach us"
      lead="Something went wrong while sending it, or a field was missing. Please try again, or contact us directly."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/#call-back">Try again</ButtonLink>
        {whatsapp ? (
          <ButtonLink href={whatsapp} variant="secondary">
            Chat on WhatsApp
          </ButtonLink>
        ) : null}
        {site.email ? (
          <ButtonLink href={`mailto:${site.email}`} variant="secondary">
            Email {site.email}
          </ButtonLink>
        ) : null}
      </div>
    </PageHeader>
  );
}
