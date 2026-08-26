import { notFound } from 'next/navigation';
import { WorkspacePlaceholder } from '@/components/shell';
import { findNavItem } from '@/lib/nav';

export default async function StudentSectionPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const item = findNavItem('STUDENT', slug.join('/'));
  if (!item) notFound();

  return (
    <WorkspacePlaceholder
      title={item.label}
      description="This workspace section hasn't been built yet — see docs/roadmaps/frontend-roadmap.md for the phase that owns it."
    />
  );
}
