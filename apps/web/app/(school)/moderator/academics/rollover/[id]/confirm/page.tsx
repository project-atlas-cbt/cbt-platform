import { use } from 'react';
import { notFound } from 'next/navigation';
import { RolloverConfirmScreen } from '@/components/academics/rollover/rollover-confirm-screen';
import { isUuid } from '@/lib/utils';

export default function ModeratorRolloverConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  if (!isUuid(id)) {
    notFound();
  }
  return <RolloverConfirmScreen planId={id} basePath="/moderator/academics" />;
}
