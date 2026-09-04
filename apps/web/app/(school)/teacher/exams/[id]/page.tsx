'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useExam } from '@/lib/exams/queries';
import { resolveWizardEntryStep, examStepPath } from '@/lib/exams/navigation';

const BASE_PATH = '/teacher/exams';

/** A bare `/teacher/exams/:id` link (e.g. from an external reference)
 * redirects into wherever the wizard makes sense to resume —
 * `resolveWizardEntryStep`'s own doc comment covers the heuristic. */
export default function ExamRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const exam = useExam(id);

  useEffect(() => {
    if (!exam.data) return;
    router.replace(examStepPath(BASE_PATH, id, resolveWizardEntryStep(exam.data)));
  }, [exam.data, id, router]);

  if (exam.isError) {
    return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  }
  return <Skeleton className="h-96 w-full" />;
}
