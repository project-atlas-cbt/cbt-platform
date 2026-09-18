import { QuestionAnalyticsView } from '@/components/analytics/question-analytics-view';

interface QuestionAnalyticsPageProps {
  params: Promise<{ examId: string }>;
}

export default async function QuestionAnalyticsPage({ params }: QuestionAnalyticsPageProps) {
  const { examId } = await params;
  return <QuestionAnalyticsView examId={examId} />;
}
