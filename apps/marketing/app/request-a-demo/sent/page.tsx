import type { Metadata } from 'next';
import { ButtonLink, PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Request sent',
  robots: { index: false },
};

export default function SentPage() {
  return (
    <PageHeader
      eyebrow="Request sent"
      title="Thank you. We’ll be in touch soon."
      lead="We’ll contact you on the number or email you gave to arrange a time. In the meantime, the lab checklist is a good place to start."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/guides/cbt-lab-checklist">Read the lab checklist</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Back to the home page
        </ButtonLink>
      </div>
    </PageHeader>
  );
}
