import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ApiComponents } from '@atlas/contracts';
import { cn } from '@/lib/utils';
import { READINESS_CHECK_STEP, examStepPath } from '@/lib/exams/navigation';

type ExamReadinessCheck = ApiComponents['schemas']['ExamReadinessCheckItemDto'];

/**
 * F11 — the itemised readiness checklist (`05 §72`, DoD item 6): every
 * check renders individually with a pass/fail icon and its own message,
 * never collapsed to a single boolean. No prior art exists anywhere in this
 * codebase for a checklist UI shaped like this — built fresh.
 *
 * `interactive` (default `true`) governs whether a failed item's resolution
 * link renders — `basePath`/`examId` are only meaningful for the Teacher
 * wizard, which is the only place a "go fix this" destination exists;
 * `ExamDetailScreen` (the oversight-only read view for School Admin/
 * Moderator/HOD) passes `interactive={false}` since there is no wizard for
 * those roles to link into (DoD item 7 is a Teacher-workspace requirement).
 * Codes absent from `READINESS_CHECK_STEP` (`SCHOOL_ACTIVE`/`SESSION_ACTIVE`
 * /`TERM_ACTIVE`) never render a link regardless — platform/academic-
 * structure state with no in-builder resolution screen.
 */
export function ReadinessChecklist({
  checks,
  basePath,
  examId,
  interactive = true,
}: {
  checks: ExamReadinessCheck[];
  basePath?: string;
  examId?: string;
  interactive?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {checks.map((check) => {
        const step = READINESS_CHECK_STEP[check.code];
        const canLink = interactive && !check.passed && step && basePath && examId;
        return (
          <li key={check.code} className="flex items-start gap-3 px-4 py-3">
            {check.passed ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            )}
            <div className="flex-1 space-y-0.5">
              <p
                className={cn(
                  'text-sm font-medium',
                  check.passed ? 'text-text-primary' : 'text-danger',
                )}
              >
                {check.label}
              </p>
              <p className="text-sm text-text-secondary">{check.message}</p>
            </div>
            {canLink ? (
              <Link
                href={examStepPath(basePath, examId, step)}
                className="shrink-0 text-sm font-medium text-brand-primary hover:underline"
              >
                Resolve
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
