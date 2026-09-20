'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  BookOpen,
  UserCheck,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Save,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useRolloverPlan,
  useSession,
  useSessions,
  useDepartments,
  useSubjects,
} from '@/lib/academics/queries';
import { useUpdateRolloverStructure } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';
import { RolloverStepper } from './rollover-stepper';

interface RolloverPlanScreenProps {
  planId?: string;
  basePath: string;
}

interface ClassDraftItem {
  id: string;
  name: string;
  level: string;
  arm: string;
  departmentId?: string | null;
  included: boolean;
}

interface OfferingDraftItem {
  id: string;
  targetDraftClassId: string;
  subjectId: string;
  included: boolean;
}

interface StaffDraftItem {
  id: string;
  assignmentKind: 'TEACHER' | 'HOD';
  membershipId: string;
  targetDraftClassId?: string | null;
  subjectId?: string | null;
  departmentId?: string | null;
  confirmed: boolean;
}

export function RolloverPlanScreen({ planId, basePath }: RolloverPlanScreenProps) {
  const canExecute = useHasPermission('progression.promote.execute');
  const sessionsQuery = useSessions();
  const planQuery = useRolloverPlan(planId, undefined, { enabled: Boolean(planId) });
  const updateStructure = useUpdateRolloverStructure(planId ?? '');

  const plan = planQuery?.data;
  const sourceSessionQuery = useSession(plan?.sourceAcademicSessionId);
  const targetSessionQuery = useSession(plan?.targetAcademicSessionId);
  const departmentsQuery = useDepartments();
  const subjectsQuery = useSubjects();

  // Local state for structure modifications before saving
  const [classInclusions, setClassInclusions] = useState<Record<string, boolean>>({});
  const [offeringInclusions, setOfferingInclusions] = useState<Record<string, boolean>>({});
  const [staffConfirmations, setStaffConfirmations] = useState<Record<string, boolean>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync draft state from query when plan structure loads or updates
  const [prevPlanKey, setPrevPlanKey] = useState<string | null>(null);
  const currentPlanKey = plan ? `${plan.id}-${plan.version}` : null;
  if (currentPlanKey && currentPlanKey !== prevPlanKey) {
    setPrevPlanKey(currentPlanKey);
    if (plan?.structure) {
      const struct = plan.structure as {
        classes?: ClassDraftItem[];
        offerings?: OfferingDraftItem[];
        staffAssignments?: StaffDraftItem[];
      };
      const cMap: Record<string, boolean> = {};
      (struct.classes ?? []).forEach((c) => {
        cMap[c.id] = c.included;
      });
      setClassInclusions(cMap);

      const oMap: Record<string, boolean> = {};
      (struct.offerings ?? []).forEach((o) => {
        oMap[o.id] = o.included;
      });
      setOfferingInclusions(oMap);

      const sMap: Record<string, boolean> = {};
      (struct.staffAssignments ?? []).forEach((s) => {
        sMap[s.id] = s.confirmed;
      });
      setStaffConfirmations(sMap);
      setHasUnsavedChanges(false);
    }
  }

  // If no planId was provided, look for an active or closed session to guide the user
  if (!planId) {
    if (sessionsQuery.isPending) {
      return (
        <div className="space-y-4" role="status">
          <Skeleton className="h-48 w-full" />
        </div>
      );
    }
    const sessions = sessionsQuery.data?.sessions ?? [];
    const closedSessions = sessions.filter((s) => s.status === 'CLOSED');
    const currentSession = sessions.find((s) => s.status === 'CURRENT');

    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Academic Session Rollover</h2>
          <p className="text-sm text-text-muted mt-1">
            Rollover clones academic structures, enables student promotion review, and transitions
            the school to a new academic session.
          </p>
        </div>

        {closedSessions.length > 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
            <h3 className="text-base font-semibold text-text-primary">
              Closed Sessions Ready for Rollover
            </h3>
            <p className="text-sm text-text-secondary">
              The following sessions have been closed and can have their rollover plan initiated or
              reviewed:
            </p>
            <div className="divide-y divide-border border border-border rounded-md">
              {closedSessions.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-text-primary">{s.name}</span>
                    <span className="text-sm text-text-muted ml-3">
                      {s.startDate} – {s.endDate}
                    </span>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`${basePath}/sessions/${s.id}/close`}>
                      Open Rollover Setup <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : currentSession ? (
          <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
            <h3 className="text-base font-semibold text-text-primary">
              Current Session: {currentSession.name}
            </h3>
            <p className="text-sm text-text-secondary">
              To begin rollover, perform the pre-flight readiness check to close the current
              session.
            </p>
            <Button asChild>
              <Link href={`${basePath}/sessions/${currentSession.id}/close`}>
                Go to Close Readiness <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="No sessions available for rollover"
            description="Create and activate an academic session first before running rollover."
          />
        )}
      </div>
    );
  }

  if (planQuery.isPending) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
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
  const struct = plan.structure as {
    classes?: ClassDraftItem[];
    offerings?: OfferingDraftItem[];
    staffAssignments?: StaffDraftItem[];
  };
  const classesList = struct.classes ?? [];
  const offeringsList = struct.offerings ?? [];
  const staffList = struct.staffAssignments ?? [];

  // Lookups for rendering
  const departmentMap = new Map(
    (departmentsQuery.data?.departments ?? []).map((d) => [d.id, d.name]),
  );
  const subjectMap = new Map((subjectsQuery.data?.subjects ?? []).map((s) => [s.id, s.name]));
  const draftClassMap = new Map(classesList.map((c) => [c.id, c.name]));

  // Counts
  const includedClassesCount = Object.values(classInclusions).filter(Boolean).length;
  const includedOfferingsCount = Object.values(offeringInclusions).filter(Boolean).length;
  const confirmedStaffCount = Object.values(staffConfirmations).filter(Boolean).length;
  const totalStudents = (plan as { pagination?: { total?: number } }).pagination?.total ?? 0;

  const handleSaveStructure = async () => {
    if (!canExecute || isCommitted) return;
    try {
      setSaveError(null);
      setSaveSuccess(false);

      const classUpdates = classesList
        .filter((c) => classInclusions[c.id] !== undefined && classInclusions[c.id] !== c.included)
        .map((c) => ({ draftId: c.id, included: classInclusions[c.id]! }));

      const offeringUpdates = offeringsList
        .filter(
          (o) => offeringInclusions[o.id] !== undefined && offeringInclusions[o.id] !== o.included,
        )
        .map((o) => ({ draftId: o.id, included: offeringInclusions[o.id]! }));

      const staffUpdates = staffList
        .filter(
          (s) => staffConfirmations[s.id] !== undefined && staffConfirmations[s.id] !== s.confirmed,
        )
        .map((s) => ({ draftId: s.id, confirmed: staffConfirmations[s.id]! }));

      if (classUpdates.length === 0 && offeringUpdates.length === 0 && staffUpdates.length === 0) {
        setHasUnsavedChanges(false);
        return;
      }

      await updateStructure.mutateAsync({
        ...(classUpdates.length > 0 ? { classes: classUpdates } : {}),
        ...(offeringUpdates.length > 0 ? { offerings: offeringUpdates } : {}),
        ...(staffUpdates.length > 0 ? { staffAssignments: staffUpdates } : {}),
        version: plan.version,
      });

      setHasUnsavedChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      void planQuery.refetch();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save structural updates.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <RolloverStepper
        currentStep="structure"
        planId={plan.id}
        sessionId={plan.sourceAcademicSessionId}
        basePath={basePath}
        isCommitted={isCommitted}
      />

      {/* Overview Card */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-text-primary">
                {sourceSessionQuery.data?.name ?? 'Source Session'} →{' '}
                {targetSessionQuery.data?.name ?? 'Target Session'}
              </h2>
              <Badge status={isCommitted ? 'success' : 'neutral'}>{plan.status}</Badge>
              <span className="text-xs font-mono text-text-muted">v{plan.version}</span>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              Review cloned classes, subject offerings, and staff proposals before proceeding to
              student promotion decisions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href={`${basePath}/rollover/${plan.id}/students`}>
                Student Decisions ({totalStudents}) <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${basePath}/rollover/${plan.id}/confirm`}>
                Proceed to Confirmation <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="rounded border border-border bg-surface-muted p-3">
            <div className="text-xs text-text-secondary">Cloned Classes</div>
            <div className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
              {includedClassesCount} / {classesList.length}
            </div>
          </div>
          <div className="rounded border border-border bg-surface-muted p-3">
            <div className="text-xs text-text-secondary">Cloned Offerings</div>
            <div className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
              {includedOfferingsCount} / {offeringsList.length}
            </div>
          </div>
          <div className="rounded border border-border bg-surface-muted p-3">
            <div className="text-xs text-text-secondary">Staff Proposals</div>
            <div className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
              {confirmedStaffCount} confirmed / {staffList.length}
            </div>
          </div>
          <div className="rounded border border-border bg-surface-muted p-3">
            <div className="text-xs text-text-secondary">Candidates</div>
            <div className="text-lg font-semibold tabular-nums text-text-primary mt-0.5">
              {totalStudents} students
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle/20 p-4 text-sm text-danger flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span>{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="rounded-md border border-success/40 bg-success-subtle/20 p-3 text-sm text-success flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>Structural changes saved successfully.</span>
        </div>
      )}

      {/* Structure Review Tabs */}
      <Tabs defaultValue="classes" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-2">
          <TabsList>
            <TabsTrigger value="classes" className="gap-2">
              <Layers className="h-4 w-4" /> Classes ({classesList.length})
            </TabsTrigger>
            <TabsTrigger value="offerings" className="gap-2">
              <BookOpen className="h-4 w-4" /> Offerings ({offeringsList.length})
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-2">
              <UserCheck className="h-4 w-4" /> Staff Assignments ({staffList.length})
            </TabsTrigger>
          </TabsList>

          {!isCommitted && canExecute && (
            <Button
              size="sm"
              disabled={!hasUnsavedChanges || updateStructure.isPending}
              onClick={() => void handleSaveStructure()}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {updateStructure.isPending ? 'Saving...' : 'Save Structure Changes'}
            </Button>
          )}
        </div>

        {/* Classes Tab */}
        <TabsContent value="classes" className="space-y-3">
          <p className="text-xs text-text-muted">
            Select which class groups should be created in the target session. Excluded classes will
            not be created; continuing students placed in an excluded class must be re-targeted in
            Student Decisions.
          </p>
          <div className="border border-border rounded-md overflow-hidden bg-surface">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-muted text-xs font-semibold text-text-secondary border-b border-border">
                <tr>
                  <th scope="col" className="p-3 w-12 text-center">
                    Include
                  </th>
                  <th scope="col" className="p-3">
                    Class Name
                  </th>
                  <th scope="col" className="p-3">
                    Level
                  </th>
                  <th scope="col" className="p-3">
                    Arm
                  </th>
                  <th scope="col" className="p-3">
                    Department
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {classesList.map((cls) => {
                  const isIncluded = classInclusions[cls.id] ?? cls.included;
                  return (
                    <tr
                      key={cls.id}
                      className={!isIncluded ? 'opacity-50 bg-surface-muted/40' : ''}
                    >
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={isIncluded}
                          disabled={isCommitted || !canExecute}
                          onCheckedChange={(checked) => {
                            setClassInclusions((prev) => ({ ...prev, [cls.id]: Boolean(checked) }));
                            setHasUnsavedChanges(true);
                          }}
                          aria-label={`Include ${cls.name}`}
                        />
                      </td>
                      <td className="p-3 font-medium text-text-primary">{cls.name}</td>
                      <td className="p-3 text-text-secondary">{cls.level}</td>
                      <td className="p-3 text-text-secondary">{cls.arm}</td>
                      <td className="p-3 text-text-secondary">
                        {cls.departmentId
                          ? (departmentMap.get(cls.departmentId) ?? 'Department')
                          : 'General'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Offerings Tab */}
        <TabsContent value="offerings" className="space-y-3">
          <p className="text-xs text-text-muted">
            Subject offerings cloned from the source session. Only offerings in included classes
            will be created in the new academic year.
          </p>
          <div className="border border-border rounded-md overflow-hidden bg-surface">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-muted text-xs font-semibold text-text-secondary border-b border-border">
                <tr>
                  <th scope="col" className="p-3 w-12 text-center">
                    Include
                  </th>
                  <th scope="col" className="p-3">
                    Target Class Draft
                  </th>
                  <th scope="col" className="p-3">
                    Subject
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offeringsList.map((off) => {
                  const isIncluded = offeringInclusions[off.id] ?? off.included;
                  const className = draftClassMap.get(off.targetDraftClassId) ?? 'Class Draft';
                  const subjectName = subjectMap.get(off.subjectId) ?? 'Subject';
                  return (
                    <tr
                      key={off.id}
                      className={!isIncluded ? 'opacity-50 bg-surface-muted/40' : ''}
                    >
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={isIncluded}
                          disabled={isCommitted || !canExecute}
                          onCheckedChange={(checked) => {
                            setOfferingInclusions((prev) => ({
                              ...prev,
                              [off.id]: Boolean(checked),
                            }));
                            setHasUnsavedChanges(true);
                          }}
                          aria-label={`Include offering ${subjectName} for ${className}`}
                        />
                      </td>
                      <td className="p-3 font-medium text-text-primary">{className}</td>
                      <td className="p-3 text-text-secondary">{subjectName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Staff Proposals Tab (ADR-0026) */}
        <TabsContent value="staff" className="space-y-3">
          <div className="rounded-md border border-brand-primary/30 bg-brand-primary-subtle/30 p-4 text-xs text-text-primary flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" aria-hidden />
            <div>
              <span className="font-semibold">ADR-0026 Proposed Assignments: </span>
              Staff assignments carry forward as unconfirmed drafts requiring explicit confirmation.
              The school neither reassigns teachers from scratch nor silently retains stale access.
            </div>
          </div>

          <div className="border border-border rounded-md overflow-hidden bg-surface">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-muted text-xs font-semibold text-text-secondary border-b border-border">
                <tr>
                  <th scope="col" className="p-3 w-28">
                    Confirm
                  </th>
                  <th scope="col" className="p-3">
                    Role
                  </th>
                  <th scope="col" className="p-3">
                    Assignment Target
                  </th>
                  <th scope="col" className="p-3">
                    Subject / Dept
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-text-muted text-sm">
                      No active staff assignments to carry forward.
                    </td>
                  </tr>
                ) : (
                  staffList.map((staff) => {
                    const isConfirmed = staffConfirmations[staff.id] ?? staff.confirmed;
                    const targetClass = staff.targetDraftClassId
                      ? draftClassMap.get(staff.targetDraftClassId)
                      : null;
                    const deptName = staff.departmentId
                      ? departmentMap.get(staff.departmentId)
                      : null;
                    const subjectName = staff.subjectId ? subjectMap.get(staff.subjectId) : null;

                    return (
                      <tr key={staff.id} className={!isConfirmed ? 'bg-surface-muted/20' : ''}>
                        <td className="p-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={isConfirmed}
                              disabled={isCommitted || !canExecute}
                              onCheckedChange={(checked) => {
                                setStaffConfirmations((prev) => ({
                                  ...prev,
                                  [staff.id]: Boolean(checked),
                                }));
                                setHasUnsavedChanges(true);
                              }}
                            />
                            <span className="text-xs font-medium">
                              {isConfirmed ? 'Confirmed' : 'Pending'}
                            </span>
                          </label>
                        </td>
                        <td className="p-3">
                          <Badge status={staff.assignmentKind === 'HOD' ? 'info' : 'neutral'}>
                            {staff.assignmentKind}
                          </Badge>
                        </td>
                        <td className="p-3 font-medium text-text-primary">
                          {staff.assignmentKind === 'HOD'
                            ? (deptName ?? 'Department')
                            : (targetClass ?? 'Class')}
                        </td>
                        <td className="p-3 text-text-secondary">
                          {staff.assignmentKind === 'HOD'
                            ? 'Department Head'
                            : (subjectName ?? 'Subject')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
