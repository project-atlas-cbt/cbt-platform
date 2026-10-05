'use client';

import { useParams } from 'next/navigation';
import { GuideScreen } from '@/components/help/guide-screen';
import { HOD_GUIDES } from '@/lib/help/guides/hod';

export default function HodGuidePage() {
  const { guide } = useParams<{ guide: string }>();
  return <GuideScreen set={HOD_GUIDES} guideId={guide} />;
}
