import { use } from 'react';
import { CloseReadinessScreen } from '@/components/academics/rollover/close-readiness-screen';

export default function ModeratorSessionClosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CloseReadinessScreen sessionId={id} basePath="/moderator/academics" />;
}
