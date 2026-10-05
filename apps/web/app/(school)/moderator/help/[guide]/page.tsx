'use client';

import { useParams } from 'next/navigation';
import { GuideScreen } from '@/components/help/guide-screen';
import { MODERATOR_GUIDES } from '@/lib/help/guides/moderator';

export default function ModeratorGuidePage() {
  const { guide } = useParams<{ guide: string }>();
  return <GuideScreen set={MODERATOR_GUIDES} guideId={guide} />;
}
