'use client';

import { useParams } from 'next/navigation';
import { ClassAssignmentScreen } from '@/components/people/class-assignment/class-assignment-screen';

/** `04 §24` — "Moderator → Class Assignment", the bulk student class-move
 * screen. Deliberately not nested under `/moderator/people/(layout)`'s
 * PeopleTabs (no `layout.tsx` in this `classes/` subtree) — it's reached
 * from a class's own context (e.g. the Academics workspace), not from one
 * of the People directory tabs. */
export default function ModeratorClassAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  return <ClassAssignmentScreen classId={id} />;
}
