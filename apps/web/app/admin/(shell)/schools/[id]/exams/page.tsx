import { ClipboardList } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';

/** SA-04's Exams section (`04 §8`) — no exam data exists anywhere in the
 *  product yet; arrives with Exam Builder (B11). */
export default function SchoolExamsPage() {
  return (
    <NotYetAvailable
      icon={ClipboardList}
      title="Not yet available"
      description="Exams don't exist yet — this arrives once Exam Builder (B11) ships."
    />
  );
}
