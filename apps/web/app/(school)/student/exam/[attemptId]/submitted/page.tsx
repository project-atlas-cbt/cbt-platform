import { SubmittedScreen } from '@/components/attempt/submitted-screen';

export default async function ExamSubmittedPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return <SubmittedScreen attemptId={attemptId} />;
}
