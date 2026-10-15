import type { Metadata } from 'next';
import { ButtonLink, PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Number received',
  robots: { index: false },
};

export default function CallBackSentPage() {
  return (
    <PageHeader
      eyebrow="Number received"
      title="Thank you. We’ll call you soon."
      lead="Someone from our team will call or WhatsApp you on the number you gave. If you’d like to see the platform in action, you can also request a demo."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/request-a-demo">Request a demo</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Back to the home page
        </ButtonLink>
      </div>
    </PageHeader>
  );
}
