import { use } from 'react';
import { RolloverPlanScreen } from '@/components/academics/rollover/rollover-plan-screen';

export default function SchoolRolloverPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RolloverPlanScreen planId={id} basePath="/school/academics" />;
}
