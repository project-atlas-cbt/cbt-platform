import type { Metadata } from 'next';
import { ButtonLink, PageHeader } from '@/components/ui';
import { site, whatsappLink } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Request not sent',
  robots: { index: false },
};

export default function NotSentPage() {
  const whatsapp = whatsappLink(site, `Hello, I'd like a demo of ${site.name} for my school.`);
  return (
    <PageHeader
      eyebrow="Request not sent"
      title="Your request didn’t reach us"
      lead="Something went wrong while sending it, or a field was missing. Please try the form again, or contact us directly."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/request-a-demo#form">Try the form again</ButtonLink>
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
