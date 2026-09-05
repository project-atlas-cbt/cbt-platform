import { ExamRuntime } from '@/components/attempt/exam-runtime';

export default async function ExamRuntimePage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return <ExamRuntime attemptId={attemptId} />;
}
