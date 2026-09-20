import { use } from 'react';
import { notFound } from 'next/navigation';
import { RolloverPlanScreen } from '@/components/academics/rollover/rollover-plan-screen';
import { isUuid } from '@/lib/utils';

export default function ModeratorRolloverPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isUuid(id)) {
    notFound();
  }
  return <RolloverPlanScreen planId={id} basePath="/moderator/academics" />;
}
