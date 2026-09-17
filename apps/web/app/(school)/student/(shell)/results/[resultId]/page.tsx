import { ResultDetailScreen } from '@/components/results/result-detail-screen';

// F14 — `04 §61` Result Detail.
export default async function StudentResultDetailPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  return <ResultDetailScreen resultId={resultId} />;
}
