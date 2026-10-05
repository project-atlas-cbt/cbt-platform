import type { Metadata } from 'next';
import { FindSchoolForm } from '@/components/find-school-form';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Check the school address',
  robots: { index: false },
};

export default function InvalidSchoolPage() {
  return (
    <PageHeader
      eyebrow="School sign-in"
      title="That isn’t a school address"
      lead="A school address uses only letters, numbers and hyphens, like kingscollege. Check your activation email or ask your school admin, then try again."
    >
      <FindSchoolForm />
    </PageHeader>
  );
}
