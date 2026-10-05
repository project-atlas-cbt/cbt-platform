'use client';

import { useParams } from 'next/navigation';
import { GuideScreen } from '@/components/help/guide-screen';
import { TEACHER_GUIDES } from '@/lib/help/guides/teacher';

export default function TeacherGuidePage() {
  const { guide } = useParams<{ guide: string }>();
  return <GuideScreen set={TEACHER_GUIDES} guideId={guide} />;
}
