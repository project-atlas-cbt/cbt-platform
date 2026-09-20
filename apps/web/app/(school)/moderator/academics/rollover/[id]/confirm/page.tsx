import { use } from 'react';
import { RolloverConfirmScreen } from '@/components/academics/rollover/rollover-confirm-screen';

export default function ModeratorRolloverConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RolloverConfirmScreen planId={id} basePath="/moderator/academics" />;
}
