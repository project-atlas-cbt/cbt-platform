import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: `Terms for using the ${site.name} website.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="4 October 2026">
      <p>
        These terms cover your use of this website. A school’s use of the {site.name} platform is
        governed by its own subscription agreement and data processing agreement, which take
        precedence over anything here.
      </p>

      <h2>Using this website</h2>
      <p>
        You may read and share the content of this website for the purpose of learning about{' '}
        {site.name}. Please do not attempt to interfere with the site, submit false requests, or use
        automated means to send requests.
      </p>

      <h2>Accuracy</h2>
      <p>
        We describe the platform as it is today and keep this website up to date. Features,
        requirements and prices can change; the details in your school’s agreement and quote are the
        ones that apply.
      </p>

      <h2>Guides</h2>
      <p>
        Our guides are general advice for schools. Use your own judgement about how they apply to
        your school.
      </p>

      <h2>Privacy</h2>
      <p>
        How we handle the details you send us is described in the{' '}
        <Link href="/privacy">privacy notice</Link>.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
    </LegalPage>
  );
}
