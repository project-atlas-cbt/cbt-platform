'use client';

import { useEffect, useState } from 'react';
import { formalName, sortByPersonName } from '@atlas/domain';
import Link from 'next/link';
import {
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  ArrowLeft,
  Edit2,
  Users,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/ui/error-state';
import { StudentSearch } from '@/components/ui/student-search';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useRolloverPlan, useStreams, type RolloverQueryParams } from '@/lib/academics/queries';
import { useHasPermission } from '@/lib/nav';
import { RolloverStepper } from './rollover-stepper';
import { OverrideDecisionDialog, type RolloverOutcomeType } from './override-decision-dialog';

interface StudentDecisionsScreenProps {
  planId: string;
  basePath: string;
}

interface DecisionRecord {
  id: string;
  sourceEnrollmentId: string;
  sourceClassId: string;
  proposedOutcome: RolloverOutcomeType;
  outcome: RolloverOutcomeType;
  targetDraftClassId?: string | null;
  reason: string;
  overriddenByUserId?: string | null;
  overriddenAt?: string | null;
  sourceClass?: {
    id: string;
    name: string;
    level: string;
    arm: string;
  };
  sourceEnrollment?: {
    id: string;
    studentProfile?: {
      id: string;
      studentId?: string;
      membership?: {
        id: string;
        loginIdentifier: string;
        user?: {
          id: string;
          firstName: string;
          middleName?: string | null;
          lastName: string;
          displayName?: string;
        };
      };
    };
  };
}

interface ClassDraftItem {
  id: string;
  name: string;
  level: string;
  arm: string;
  included: boolean;
}

export function StudentDecisionsScreen({ planId, basePath }: StudentDecisionsScreenProps) {
  const canExecute = useHasPermission('progression.promote.execute');
  const streamsQuery = useStreams();

  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedStream, setSelectedStream] = useState<string>('ALL');
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  // Search runs on the server (the list is paged), so typing waits a beat.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Selection for batch actions
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<string[]>([]);

  // Dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [dialogDecisions, setDialogDecisions] = useState<string[]>([]);
  const [dialogStudentLabels, setDialogStudentLabels] = useState<string[]>([]);
  const [dialogSourceLevel, setDialogSourceLevel] = useState<string | undefined>(undefined);

  const queryParams: RolloverQueryParams = {
    page,
    pageSize,
    ...(selectedOutcome !== 'ALL' ? { outcome: selectedOutcome as RolloverOutcomeType } : {}),
    ...(selectedLevel !== 'ALL'
      ? { sourceLevel: selectedLevel as 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3' }
      : {}),
    ...(selectedStream !== 'ALL' ? { streamId: selectedStream } : {}),
    ...(overriddenOnly ? { overriddenOnly: true as const } : {}),
    ...(search ? { q: search } : {}),
  };

  const planQuery = useRolloverPlan(planId, queryParams);
  const plan = planQuery.data;

  if (planQuery.isPending) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (planQuery.isError) {
    return <ErrorState error={planQuery.error} onRetry={() => void planQuery.refetch()} />;
  }

  if (!plan) {
    return null;
  }

  const isCommitted = plan.status === 'COMMITTED';
  const decisions = (plan.decisions ?? []) as unknown as DecisionRecord[];
  const total = (plan as { pagination?: { total?: number } }).pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const struct = plan.structure as { classes?: ClassDraftItem[] };
  const classDrafts = struct?.classes ?? [];
  const draftClassMap = new Map(classDrafts.map((c) => [c.id, c.name]));

  const allVisibleSelected =
    decisions.length > 0 && decisions.every((d) => selectedDecisionIds.includes(d.id));

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(decisions.map((d) => d.id));
      setSelectedDecisionIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const visibleIds = decisions.map((d) => d.id);
      setSelectedDecisionIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedDecisionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const openSingleOverride = (rec: DecisionRecord) => {
    const studentUser = rec.sourceEnrollment?.studentProfile?.membership?.user;
    const name = (studentUser && formalName(studentUser)) || 'Student';
    setDialogDecisions([rec.id]);
    setDialogStudentLabels([name]);
    setDialogSourceLevel(rec.sourceClass?.level);
    setOverrideDialogOpen(true);
  };

  const openBatchOverride = () => {
    if (selectedDecisionIds.length === 0) return;
    setDialogDecisions(selectedDecisionIds);
    setDialogStudentLabels(selectedDecisionIds.map((_, i) => `Student #${i + 1}`));
    setDialogSourceLevel(undefined);
    setOverrideDialogOpen(true);
  };

  const outcomeBadge = (outcome: RolloverOutcomeType) => {
    switch (outcome) {
      case 'PROMOTE':
        return <Badge status="success">Promote</Badge>;
      case 'REPEAT':
        return <Badge status="warning">Repeat Year</Badge>;
      case 'GRADUATE':
        return <Badge status="info">Graduate</Badge>;
      case 'TRANSFER':
        return <Badge status="danger">Transfer</Badge>;
      case 'WITHDRAW':
        return <Badge status="danger">Withdraw</Badge>;
      default:
        return <Badge status="neutral">{outcome}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <RolloverStepper
        currentStep="students"
        planId={plan.id}
        sessionId={plan.sourceAcademicSessionId}
        basePath={basePath}
        isCommitted={isCommitted}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Promotion Decisions Review</h2>
          <p className="text-sm text-text-secondary mt-1">
            Review promotion candidates by level and arm. Override individual or batch outcomes with
            a mandatory reason.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`${basePath}/rollover/${plan.id}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Structure Review
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`${basePath}/rollover/${plan.id}/confirm`}>
              Proceed to Confirmation <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Filters & Refinements
        </div>

        <div className="flex">
          <StudentSearch value={searchInput} onChange={setSearchInput} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Level Filter */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Level</label>
            <Select
              value={selectedLevel}
              onValueChange={(val) => {
                setSelectedLevel(val);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Levels</SelectItem>
                {['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'].map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {lvl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stream Filter (ADR-0038: by the source class's default stream) */}
          {(streamsQuery.data?.streams ?? []).length > 0 ? (
            <div>
              <label className="text-xs text-text-muted mb-1 block">Stream</label>
              <Select
                value={selectedStream}
                onValueChange={(val) => {
                  setSelectedStream(val);
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Stream">
                  <SelectValue placeholder="All streams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All streams</SelectItem>
                  {(streamsQuery.data?.streams ?? []).map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Outcome Filter */}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Outcome</label>
            <Select
              value={selectedOutcome}
              onValueChange={(val) => {
                setSelectedOutcome(val);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Outcomes</SelectItem>
                <SelectItem value="PROMOTE">Promote</SelectItem>
                <SelectItem value="REPEAT">Repeat</SelectItem>
                <SelectItem value="GRADUATE">Graduate</SelectItem>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
                <SelectItem value="WITHDRAW">Withdraw</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Overridden Only Toggle */}
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
              <Checkbox
                checked={overriddenOnly}
                onCheckedChange={(checked) => {
                  setOverriddenOnly(Boolean(checked));
                  setPage(1);
                }}
              />
              <span>Exceptions only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedDecisionIds.length > 0 && !isCommitted && canExecute && (
        <div className="rounded-lg border border-brand-primary/40 bg-brand-primary-subtle/40 p-3 px-4 flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-text-primary">
            {selectedDecisionIds.length} candidate{selectedDecisionIds.length > 1 ? 's' : ''}{' '}
            selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelectedDecisionIds([])}>
              Clear selection
            </Button>
            <Button size="sm" onClick={openBatchOverride}>
              <Edit2 className="h-4 w-4 mr-1.5" /> Batch Override
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="border border-border rounded-md overflow-hidden bg-surface">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-muted text-xs font-semibold text-text-secondary border-b border-border">
            <tr>
              {!isCommitted && canExecute && (
                <th scope="col" className="p-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-text-secondary hover:text-text-primary p-0.5"
                    aria-label={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
              )}
              <th scope="col" className="p-3">
                Student
              </th>
              <th scope="col" className="p-3">
                Current Class
              </th>
              <th scope="col" className="p-3">
                Proposed
              </th>
              <th scope="col" className="p-3">
                Final Decision
              </th>
              <th scope="col" className="p-3">
                Target Placement
              </th>
              <th scope="col" className="p-3">
                Reason
              </th>
              {!isCommitted && canExecute && (
                <th scope="col" className="p-3 w-20 text-right">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {decisions.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-text-muted">
                  <EmptyState
                    icon={Users}
                    title="No student decisions found"
                    description="No candidates match the active filter criteria."
                  />
                </td>
              </tr>
            ) : (
              sortByPersonName([...decisions], (rec) => ({
                firstName: rec.sourceEnrollment?.studentProfile?.membership?.user?.firstName ?? '',
                middleName: rec.sourceEnrollment?.studentProfile?.membership?.user?.middleName,
                lastName: rec.sourceEnrollment?.studentProfile?.membership?.user?.lastName ?? '',
                identifier: rec.sourceEnrollment?.studentProfile?.studentId,
              })).map((rec) => {
                const isSelected = selectedDecisionIds.includes(rec.id);
                const isOverridden = Boolean(rec.overriddenAt);
                const studentUser = rec.sourceEnrollment?.studentProfile?.membership?.user;
                const studentProfile = rec.sourceEnrollment?.studentProfile;
                const studentName = (studentUser && formalName(studentUser)) || 'Student Candidate';
                const regNo =
                  studentProfile?.studentId ??
                  rec.sourceEnrollment?.studentProfile?.membership?.loginIdentifier ??
                  '—';
                const currentClassName = rec.sourceClass?.name ?? 'Class';
                const targetClassName = rec.targetDraftClassId
                  ? (draftClassMap.get(rec.targetDraftClassId) ?? 'Class Draft')
                  : '—';

                return (
                  <tr
                    key={rec.id}
                    className={
                      isSelected
                        ? 'bg-brand-primary-subtle/30'
                        : isOverridden
                          ? 'bg-warning-subtle/10'
                          : undefined
                    }
                  >
                    {!isCommitted && canExecute && (
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleRow(rec.id)}
                          aria-label={`Select ${studentName}`}
                        />
                      </td>
                    )}
                    <td className="p-3">
                      <div className="font-medium text-text-primary">{studentName}</div>
                      <div className="text-xs font-mono text-text-muted">{regNo}</div>
                    </td>
                    <td className="p-3 text-text-secondary font-medium">{currentClassName}</td>
                    <td className="p-3">{outcomeBadge(rec.proposedOutcome)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {outcomeBadge(rec.outcome)}
                        {isOverridden && (
                          <span title="Overridden by Administrator" className="text-warning">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-text-primary">{targetClassName}</td>
                    <td
                      className="p-3 text-xs text-text-muted max-w-xs truncate"
                      title={rec.reason}
                    >
                      {rec.reason}
                    </td>
                    {!isCommitted && canExecute && (
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSingleOverride(rec)}
                          aria-label={`Override decision for ${studentName}`}
                        >
                          Override
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="p-3 bg-surface-muted border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs text-text-secondary">
          <div>
            Showing{' '}
            <span className="font-semibold tabular-nums text-text-primary">{decisions.length}</span>{' '}
            of <span className="font-semibold tabular-nums text-text-primary">{total}</span>{' '}
            candidates
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="tabular-nums font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Override Dialog */}
      <OverrideDecisionDialog
        open={overrideDialogOpen}
        onOpenChange={setOverrideDialogOpen}
        decisionIds={dialogDecisions}
        studentLabels={dialogStudentLabels}
        sourceLevel={dialogSourceLevel ?? undefined}
        classDrafts={classDrafts}
        planVersion={plan.version}
        planId={plan.id}
        onSuccess={() => {
          setSelectedDecisionIds([]);
          void planQuery.refetch();
        }}
      />
    </div>
  );
}
