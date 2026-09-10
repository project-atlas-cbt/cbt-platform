import { StudentProfileScreen } from '@/components/student/student-profile-screen';

// F14 — `04 §62` Profile. Supersedes the `[...slug]` catch-all
// automatically, matching this codebase's established pattern (F2/F3/F6/…).
export default function StudentProfilePage() {
  return <StudentProfileScreen />;
}
