'use client';

import { useParams } from 'next/navigation';
import { ClassAssignmentScreen } from '@/components/people/class-assignment/class-assignment-screen';

/** `04 §24` — "Moderator → Class Assignment", the bulk student class-move
 * screen. Deliberately not nested under `/moderator/people/(layout)`'s
 * PeopleTabs (no `layout.tsx` in this `classes/` subtree) — it's reached
 * from a class's own context (`/moderator/academics/classes`'s "Move
 * students" row action, `classes-screen.tsx`'s `studentAssignmentBasePath`
 * prop), not from one of the People directory tabs.
 *
 * Gap closure: this doc comment originally described the intended entry
 * point without it actually existing anywhere — the route was reachable
 * only by typing the URL directly. Fixed by adding the row action above
 * rather than by relocating this page. */
export default function ModeratorClassAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  return <ClassAssignmentScreen classId={id} />;
}
