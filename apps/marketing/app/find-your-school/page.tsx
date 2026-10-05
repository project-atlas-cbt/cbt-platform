import type { Metadata } from 'next';
import { FindSchoolForm } from '@/components/find-school-form';
import { Container, PageHeader } from '@/components/ui';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Find your school',
  description: `Sign in to your school’s ${site.name} at its own address.`,
  alternates: { canonical: '/find-your-school' },
};

export default function FindYourSchoolPage() {
  return (
    <>
      <PageHeader
        eyebrow="School sign-in"
        title="Every school signs in at its own address"
        lead={`Students, staff and school admins sign in at their school’s address, such as yourschool.${site.rootDomain}. Enter yours and we’ll take you there.`}
      >
        <FindSchoolForm />
      </PageHeader>
      <Container className="max-w-3xl py-14">
        <h2 className="font-display text-xl font-semibold text-ink">Activating a new school?</h2>
        <p className="mt-3 leading-relaxed text-ink-2">
          Use the activation link in the email we sent your school admin. It opens your school’s
          address with the key filled in, where you activate the school and set your password.
        </p>
      </Container>
    </>
  );
}
