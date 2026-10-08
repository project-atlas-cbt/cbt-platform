'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import type { ApiComponents } from '@atlas/contracts';
import { cn } from '@/lib/utils';
import { examStepPath, type ExamWizardStep } from '@/lib/exams/navigation';
import { examControlPath } from '@/lib/exam-control/navigation';
import { useAuth } from '@/lib/auth';
import { HelpLink } from '@/components/help/help-link';

type Exam = ApiComponents['schemas']['ExamResponseDto'];

const STEPS: { step: ExamWizardStep; label: string }[] = [
  { step: 'details', label: 'Details' },
  { step: 'questions', label: 'Questions' },
  { step: 'rules', label: 'Rules' },
  { step: 'review', label: 'Review' },
];

/**
 * F11 — the builder's step-progress header (`04 §42`'s guided
 * Details→Questions→Rules→Review→Ready flow). A plain component wrapping
 * each step page's own content, not a Next.js layout — deciding
 * disabled-until-a-draft-exists / read-only-once-not-DRAFT needs the live
 * `exam` object a layout can't easily thread down per navigation. Each step
 * page still owns its own form state/autosave/unsaved-changes guard (see
 * `ExamDetailsForm`) — this shell only renders navigation and the DoD item 9
 * "why is this read-only" banner.
 */
export function ExamWizardShell({
  basePath,
  examId,
  exam,
  children,
}: {
  basePath: string;
  examId: string | undefined;
  exam: Exam | undefined;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { me } = useAuth();
  const readOnly = Boolean(exam) && exam?.status !== 'DRAFT';
  // Only the author edits an exam (ADR-0037). A colleague who reaches the
  // builder by link is a delegate at most, and runs the exam from Exam Control.
  if (exam && me && exam.createdByMembershipId !== me.membership.id) {
    const controlBase = basePath.replace(/\/exams$/, '/exam-control');
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          This exam belongs to <strong className="text-text-primary">{exam.createdByName}</strong>.
          Only its author can change it.{' '}
          <Link
            href={examControlPath(controlBase, exam.id)}
            className="font-medium text-text-primary underline"
          >
            Open it in Exam Control
          </Link>{' '}
          if you were asked to run it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Exam builder steps" className="flex flex-wrap gap-1">
          {STEPS.map(({ step, label }) => {
            const href = examId ? examStepPath(basePath, examId, step) : undefined;
            const isActive = href ? pathname === href : false;
            const disabled = !href;
            return disabled ? (
              <span
                key={step}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted"
              >
                {label}
              </span>
            ) : (
              <Link
                key={step}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-primary text-brand-primary-foreground'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <HelpLink context="examBuilder" />
      </div>

      {readOnly ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            This exam is <strong>{exam?.status}</strong> and can no longer be edited here — its
            configuration is shown for reference only.{' '}
            {exam?.status === 'READY' ? 'Cancel it first if it needs further changes.' : null}
          </p>
        </div>
      ) : null}

      {children}
    </div>
  );
}
