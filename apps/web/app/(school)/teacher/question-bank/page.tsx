'use client';

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useHasPermission } from '@/lib/nav';

/**
 * F8 — a minimal landing page, not the real Question Bank workspace (`F9`,
 * NOT STARTED). Exists only so `/teacher/question-bank/import` has a real
 * parent to link back to, and so the nav item this route already has
 * (`nav-model.ts`'s `question-bank`, unimplemented since an earlier phase)
 * resolves to something more than the generic `[...slug]` placeholder.
 * `F9`'s real screen supersedes this file the same way every prior phase's
 * real `page.tsx` has superseded a catch-all placeholder — see the F8 plan's
 * own note on this being a deliberate, reversible, low-risk call.
 */
export default function TeacherQuestionBankPage() {
  const canImport = useHasPermission('questionBank.import');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Question Bank</h1>
        {canImport ? (
          <Button asChild>
            <Link href="/teacher/question-bank/import">
              <Upload aria-hidden /> Import questions
            </Link>
          </Button>
        ) : null}
      </div>
      <EmptyState
        title="The full Question Bank is coming soon"
        description="Creating and browsing questions individually isn't built yet — see docs/roadmaps/frontend-roadmap.md's F9 phase. Bulk import is available now."
      />
    </div>
  );
}
