'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CLASS_LEVELS, DEFAULT_GRADING_SCALE_NAME, type ClassLevel } from '@atlas/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format/date';
import { useGradingScales, useGradingScaleVersions } from '@/lib/school-settings/queries';
import { usePutGradingScale } from '@/lib/school-settings/mutations';
import {
  GRADE_LABEL_MAX_LENGTH,
  SCALE_NAME_MAX_LENGTH,
  draftSignature,
  emptyBandDraft,
  parseBandDrafts,
  summariseBands,
  toBandDrafts,
  type BandDraft,
} from '@/lib/school-settings/grading-scale-form';

type GradingScales = NonNullable<ReturnType<typeof useGradingScales>['data']>;
type GradingScale = GradingScales['items'][number];
type Band = GradingScales['defaultTemplate'][number];

/** `'SCHOOL'` is the school-wide scale (`level = null`). */
type Scope = 'SCHOOL' | ClassLevel;

const SCHOOL_SCOPE_LABEL = 'All classes (school-wide)';

interface GradingScaleSectionProps {
  canEdit: boolean;
  /** Reported up so the page registers one combined dirty flag with the
   * settings tab guard (two `useRegisterFormDirty` calls would overwrite
   * each other). */
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * ADR-0018 grading configuration (F5 DoD 7, `05 §46`, `04 §19`). A school
 * has a school-wide scale and, optionally, its own scale for any class
 * level; a result is graded with its level's own scale when one exists,
 * else the school-wide one (`GradingScaleService.resolveScaleForLevel`).
 *
 * A save is never an in-place edit — the API adds a version, results
 * already finalised keep the grade and version they were given, and only
 * results finalised afterwards use the new bands. With no scale yet, the
 * platform default is offered as an unsaved starting point (`05 §46`: "a
 * starting point, never enforced").
 *
 * The API has no way to retire a level's own scale, so once saved it can
 * be changed but not removed; the screen says so before one is created.
 */
export function GradingScaleSection({ canEdit, onDirtyChange }: GradingScaleSectionProps) {
  const scales = useGradingScales();
  const headingId = useId();
  const scopeId = useId();
  const [scope, setScope] = useState<Scope>('SCHOOL');
  const [creatingFor, setCreatingFor] = useState<ClassLevel | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  // Kept here, not in the editor: a save remounts the editor on the new
  // version, and the confirmation must survive that.
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  useEffect(() => onDirtyChange(editorDirty), [editorDirty, onDirtyChange]);

  const heading = (
    <div className="space-y-1">
      <h2 id={headingId} className="text-sm font-medium text-text-secondary">
        Grading scale
      </h2>
      <p className="text-sm text-text-muted">
        A result&apos;s grade is worked out once, when the result is finalised. Saving creates a new
        version: only results finalised after you save use it, and grades already given never
        change.
      </p>
    </div>
  );

  if (scales.isPending) {
    return (
      <section aria-labelledby={headingId} className="space-y-4 border-t border-border pt-6">
        {heading}
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  if (scales.isError) {
    return (
      <section aria-labelledby={headingId} className="space-y-4 border-t border-border pt-6">
        {heading}
        <ErrorState error={scales.error} onRetry={() => void scales.refetch()} />
      </section>
    );
  }

  const schoolWide = scales.data.items.find((s) => s.level === null) ?? null;
  const levelScale = (level: ClassLevel) =>
    scales.data.items.find((s) => s.level === level) ?? null;
  const selected = scope === 'SCHOOL' ? schoolWide : levelScale(scope);
  const level = scope === 'SCHOOL' ? null : scope;

  function changeScope(next: Scope) {
    setScope(next);
    setCreatingFor(null);
    setSavedVersion(null);
  }

  let body: ReactNode;
  if (scope === 'SCHOOL' || selected || creatingFor === scope) {
    // The school-wide scale, a level's own scale, or a level's new scale
    // starting from a copy of the school-wide bands.
    const startBands =
      selected?.currentVersion?.bands ??
      (level ? schoolWide?.currentVersion?.bands : undefined) ??
      scales.data.defaultTemplate;
    const startName =
      selected?.name ?? (level ? `${level} grading scale` : DEFAULT_GRADING_SCALE_NAME);
    body = (
      <GradingScaleEditor
        key={`${scope}:${selected?.currentVersion?.id ?? 'new'}`}
        canEdit={canEdit}
        onDirtyChange={setEditorDirty}
        scale={selected}
        level={level}
        startName={startName}
        startBands={startBands}
        savedVersion={savedVersion}
        onSaved={setSavedVersion}
        onCancel={level && !selected ? () => setCreatingFor(null) : undefined}
      />
    );
  } else {
    body = (
      <div className="space-y-3 rounded-md border border-border px-3 py-3 text-sm">
        <p>
          {schoolWide?.currentVersion
            ? `${scope} uses the school-wide scale (version ${schoolWide.currentVersion.versionNumber}).`
            : `${scope} uses the school-wide scale, which has not been set yet.`}
        </p>
        {canEdit ? (
          <>
            <p className="text-text-muted">
              Give {scope} its own scale only if it grades differently. Once saved, a level&apos;s
              own scale can be changed but not removed.
            </p>
            <Button type="button" variant="secondary" onClick={() => setCreatingFor(scope)}>
              Give {scope} its own scale
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  // The scale that grades results in the chosen scope right now.
  const effective = selected?.currentVersion ?? schoolWide?.currentVersion ?? null;

  return (
    <section aria-labelledby={headingId} className="space-y-4 border-t border-border pt-6">
      {heading}

      <div className="max-w-sm space-y-1">
        <Label htmlFor={scopeId}>Scale for</Label>
        <Select
          value={scope}
          onValueChange={(value) => changeScope(value as Scope)}
          disabled={editorDirty}
        >
          <SelectTrigger id={scopeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SCHOOL">{SCHOOL_SCOPE_LABEL}</SelectItem>
            {CLASS_LEVELS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
                {levelScale(value) ? ' (own scale)' : ' (uses school-wide)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editorDirty ? (
          <p className="text-xs text-text-muted">
            Save or discard your changes before switching to another scale.
          </p>
        ) : null}
      </div>

      {effective ? null : (
        <div
          role="status"
          className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
        >
          <p className="font-medium">
            {scope === 'SCHOOL'
              ? 'No school-wide grading scale has been saved yet.'
              : `No grading scale applies to ${scope} yet.`}
          </p>
          <p>
            Results finalised now are recorded as Ungraded and stay that way, with no pass rate.
            {canEdit
              ? ' The default bands are a starting point: change them if your school grades differently, then save.'
              : ' A school admin needs to set one.'}
          </p>
        </div>
      )}

      {body}
    </section>
  );
}

interface GradingScaleEditorProps {
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** The saved scale being versioned, or null to create one. */
  scale: GradingScale | null;
  level: ClassLevel | null;
  startName: string;
  startBands: readonly Band[];
  savedVersion: number | null;
  onSaved: (version: number | null) => void;
  /** Offered while creating a level's own scale, to back out. */
  onCancel: (() => void) | undefined;
}

function GradingScaleEditor({
  canEdit,
  onDirtyChange,
  scale,
  level,
  startName,
  startBands,
  savedVersion,
  onSaved,
  onCancel,
}: GradingScaleEditorProps) {
  const putScale = usePutGradingScale();
  const current = scale?.currentVersion ?? null;

  const [name, setName] = useState(startName);
  const [rows, setRows] = useState<BandDraft[]>(() => toBandDrafts(startBands));
  // An unsaved starting point (the default template, or a copy of the
  // school-wide bands) only counts as dirty once the admin changes
  // something; Save is offered regardless.
  const [baseline] = useState(() => draftSignature(startName, toBandDrafts(startBands)));
  const [showIssues, setShowIssues] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty = draftSignature(name, rows) !== baseline;
  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const parsed = useMemo(() => parseBandDrafts(name, rows), [name, rows]);
  const issues = parsed.ok ? [] : parsed.issues;
  const visibleIssues = showIssues || isDirty ? issues : [];

  const nextVersion = (current?.versionNumber ?? 0) + 1;
  const nameId = useId();
  const issuesId = useId();

  function edited() {
    onSaved(null);
    setSaveError(null);
  }

  function updateRow(key: string, patch: Partial<BandDraft>) {
    edited();
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function discard() {
    setName(startName);
    setRows(toBandDrafts(startBands));
    setShowIssues(false);
    setSaveError(null);
  }

  async function save() {
    edited();
    if (!parsed.ok) {
      setShowIssues(true);
      return;
    }
    try {
      const result = await putScale.mutateAsync({
        ...(scale ? { scaleId: scale.id } : {}),
        name: name.trim(),
        ...(level ? { level } : {}),
        bands: parsed.bands,
      });
      onSaved(result.currentVersion?.versionNumber ?? nextVersion);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the grading scale.');
    }
  }

  // A view-only user with nothing saved has nothing to look at but the
  // warning above.
  if (!canEdit && !current) return null;

  return (
    <div className="space-y-4">
      {current ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>
            Version {current.versionNumber}, saved {formatDateTime(current.createdAt)}
          </span>
          {current.inUse ? (
            <Badge status="info" className="whitespace-nowrap">
              Used for grades
            </Badge>
          ) : null}
        </p>
      ) : null}

      <div className="max-w-sm space-y-1">
        <Label htmlFor={nameId}>Scale name</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={SCALE_NAME_MAX_LENGTH}
          disabled={!canEdit}
          onChange={(e) => {
            edited();
            setName(e.target.value);
          }}
        />
      </div>

      <Table aria-describedby={visibleIssues.length > 0 ? issuesId : undefined}>
        <caption className="sr-only">
          Grade bands. Each band covers percentages from its From value to its To value, inclusive.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Grade</TableHead>
            <TableHead scope="col">From %</TableHead>
            <TableHead scope="col">To %</TableHead>
            <TableHead scope="col">Pass</TableHead>
            {canEdit ? (
              <TableHead scope="col">
                <span className="sr-only">Remove</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const rowLabel = row.label.trim() || `row ${index + 1}`;
            return (
              <TableRow key={row.key}>
                <TableCell>
                  <Input
                    aria-label={`Grade label, row ${index + 1}`}
                    className="w-24"
                    value={row.label}
                    maxLength={GRADE_LABEL_MAX_LENGTH}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(row.key, { label: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`From percentage, grade ${rowLabel}`}
                    className="w-24 tabular-nums"
                    inputMode="decimal"
                    value={row.minPercentage}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(row.key, { minPercentage: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`To percentage, grade ${rowLabel}`}
                    className="w-24 tabular-nums"
                    inputMode="decimal"
                    value={row.maxPercentage}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(row.key, { maxPercentage: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    aria-label={`Grade ${rowLabel} is a pass`}
                    checked={row.isPassing}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      updateRow(row.key, { isPassing: checked === true })
                    }
                  />
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove grade ${rowLabel}`}
                      disabled={rows.length === 1}
                      onClick={() => {
                        edited();
                        setRows((prev) => prev.filter((r) => r.key !== row.key));
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {visibleIssues.length > 0 ? (
        <div id={issuesId} role="alert" className="text-sm text-danger">
          <p className="font-medium">Fix these before saving:</p>
          <ul className="list-disc pl-5">
            {visibleIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {saveError}
        </p>
      ) : null}
      {savedVersion !== null && !isDirty ? (
        <p role="status" className="text-sm text-success">
          Grading scale saved as version {savedVersion}.
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              edited();
              setRows((prev) => [...prev, emptyBandDraft()]);
            }}
          >
            <Plus aria-hidden="true" />
            Add grade
          </Button>
          {isDirty ? (
            <Button type="button" variant="ghost" onClick={discard}>
              Discard changes
            </Button>
          ) : null}
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            loading={putScale.isPending}
            disabled={current !== null && !isDirty}
            onClick={() => void save()}
          >
            {current ? `Save as version ${nextVersion}` : 'Save grading scale'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">You have view-only access to the grading scale.</p>
      )}

      {scale ? <VersionHistory scaleId={scale.id} /> : null}
    </div>
  );
}

function VersionHistory({ scaleId }: { scaleId: string }) {
  const versions = useGradingScaleVersions(scaleId);

  return (
    <details className="rounded-md border border-border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-text-secondary">
        Version history
      </summary>
      <div className="mt-3">
        {versions.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : versions.isError ? (
          <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
        ) : (
          <Table>
            <caption className="sr-only">Every saved version of this scale, newest first.</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col">Saved</TableHead>
                <TableHead scope="col">Bands</TableHead>
                <TableHead scope="col">Grades given</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.data.items.map((version, index) => (
                <TableRow key={version.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {version.versionNumber}
                    {index === 0 ? <span className="text-text-muted"> (current)</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(version.createdAt)}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {summariseBands(version.bands)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {version.inUse ? (
                      <Badge status="info">Used for grades</Badge>
                    ) : (
                      <Badge>Not used yet</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </details>
  );
}
