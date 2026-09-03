'use client';

import { BarChart3, ClipboardList } from 'lucide-react';
import { NotYetAvailable } from '@/components/platform/not-yet-available';
import { ReviewQueueWidget } from '@/components/question-review/review-queue-widget';

/**
 * F10 — the real HOD dashboard (`04 §29`), scoped down from the full mockup
 * to exactly what this phase's backend pairing (`B9`) supports: the
 * pending-review widget. The rest of `04 §29`'s stats (teacher/student/
 * class/subject counts, active/completed exams, department average) need
 * backend that doesn't exist as a single endpoint yet — a department-stats
 * aggregation endpoint (not scoped to any phase), `B11` (exams), and `B15`
 * (marking) respectively — so they stay an honest "not yet available"
 * section rather than a fabricated one, matching this codebase's own
 * established precedent (F2/F3/F5/F6) for a dashboard gated on a missing
 * dependency. This supersedes the placeholder whose own copy already named
 * this exact phase as "later, separately-scoped."
 */
export default function HodDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>

      <ReviewQueueWidget />

      <div className="grid gap-4 sm:grid-cols-2">
        <NotYetAvailable
          icon={BarChart3}
          title="Department overview isn't available yet"
          description="Teacher/student/class/subject counts and department average need a department-stats endpoint that doesn't exist yet."
        />
        <NotYetAvailable
          icon={ClipboardList}
          title="Exams aren't available yet"
          description="Active and completed exam counts need the exam engine (B11 onward)."
        />
      </div>
    </div>
  );
}
