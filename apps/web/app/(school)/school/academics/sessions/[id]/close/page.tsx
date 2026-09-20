import { use } from 'react';
import { notFound } from 'next/navigation';
import { CloseReadinessScreen } from '@/components/academics/rollover/close-readiness-screen';
import { isUuid } from '@/lib/utils';

export default function SchoolSessionClosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isUuid(id)) {
    notFound();
  }
  return <CloseReadinessScreen sessionId={id} basePath="/school/academics" />;
}
