'use client';

import { useParams } from 'next/navigation';
import { GuideScreen } from '@/components/help/guide-screen';
import { SCHOOL_ADMIN_GUIDES } from '@/lib/help/guides/school-admin';

export default function SchoolAdminGuidePage() {
  const { guide } = useParams<{ guide: string }>();
  return <GuideScreen set={SCHOOL_ADMIN_GUIDES} guideId={guide} />;
}
