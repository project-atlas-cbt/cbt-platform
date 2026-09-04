'use client';

import { useMemo, useState } from 'react';
import type { ApiComponents } from '@atlas/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthorizeParticipants } from '@/lib/exam-control/mutations';
import { describeExamControlError } from '@/lib/exam-control/error-utils';

type EligibleStudent = ApiComponents['schemas']['EligibleStudentResponseDto'];

/**
 * F12 — the roadmap's own named `BatchAuthorizer` component (`05 §29`:
 * "It simply asks: 'Who should be allowed to start?'"). The "Not yet
 * authorized" filter defaults active whenever `accessMode ===
 * 'EXPLICIT_AUTHORIZATION'` — ADR-0006's own named requirement that
 * students awaiting explicit authorization be surfaced distinctly, since
 * nobody is auto-authorized in that mode at all (unlike `OPEN_TO_ELIGIBLE`,
 * where this view mostly matters for students enrolled *after* a session
 * opened — ADR-0006's other named case).
 */
export function BatchAuthorizer({
  examId,
  sessionId,
  accessMode,
  students,
}: {
  examId: string;
  sessionId: string;
  accessMode: string;
  students: EligibleStudent[];
}) {
  const [onlyUnauthorized, setOnlyUnauthorized] = useState(accessMode === 'EXPLICIT_AUTHORIZATION');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<
    Record<string, { authorized: boolean; failedChecks: string[] }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const authorize = useAuthorizeParticipants(examId);

  const visible = useMemo(
    () => students.filter((s) => (onlyUnauthorized ? s.participantStatus !== 'AUTHORIZED' : true)),
    [students, onlyUnauthorized],
  );
  const notYetAuthorizedCount = students.filter((s) => s.participantStatus !== 'AUTHORIZED').length;

  function toggle(studentProfileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentProfileId)) next.delete(studentProfileId);
      else next.add(studentProfileId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const eligibleIds = visible.filter((s) => s.eligible).map((s) => s.studentProfileId);
      const allSelected = eligibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of eligibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function handleAuthorize() {
    setError(null);
    try {
      const response = await authorize.mutateAsync({
        sessionId,
        studentProfileIds: [...selected],
      });
      const byId: Record<string, { authorized: boolean; failedChecks: string[] }> = {};
      for (const result of response.results) {
        byId[result.studentProfileId] = {
          authorized: result.authorized,
          failedChecks: result.failedChecks,
        };
      }
      setResults(byId);
      setSelected(new Set());
    } catch (err) {
      setError(describeExamControlError(err));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={onlyUnauthorized}
          onClick={() => setOnlyUnauthorized((v) => !v)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary aria-pressed:border-brand-primary aria-pressed:bg-brand-primary aria-pressed:text-brand-primary-foreground"
        >
          Not yet authorized ({notYetAuthorizedCount})
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={toggleAllVisible} type="button">
            Select all eligible
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            loading={authorize.isPending}
            onClick={() => void handleAuthorize()}
          >
            Authorize selected ({selected.size})
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-md border border-border">
        {visible.map((student) => {
          const result = results[student.studentProfileId];
          return (
            <li
              key={student.studentProfileId}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <Checkbox
                checked={selected.has(student.studentProfileId)}
                disabled={!student.eligible}
                onCheckedChange={() => toggle(student.studentProfileId)}
                aria-label={`Select ${student.studentName}`}
              />
              <div className="flex-1">
                <p className="font-medium text-text-primary">{student.studentName}</p>
                <p className="text-xs text-text-muted">{student.studentIdNumber}</p>
                {!student.eligible && student.failedChecks.length > 0 ? (
                  <p className="text-xs text-danger">{student.failedChecks.join(', ')}</p>
                ) : null}
                {result && !result.authorized ? (
                  <p className="text-xs text-danger">
                    Not authorized: {result.failedChecks.join(', ')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
