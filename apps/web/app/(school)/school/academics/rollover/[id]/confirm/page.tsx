import { use } from 'react';
import { RolloverConfirmScreen } from '@/components/academics/rollover/rollover-confirm-screen';

export default function SchoolRolloverConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RolloverConfirmScreen planId={id} basePath="/school/academics" />;
}
