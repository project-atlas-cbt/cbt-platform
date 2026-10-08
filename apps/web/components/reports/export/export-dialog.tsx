/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect } from 'react';
import type { Role } from '@atlas/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateExport } from '@/lib/reports/queries';
import { useExam } from '@/lib/exams/queries';
import {
  useClassOptions,
  useDepartmentOptions,
  useExamOptions,
  useSubjectOptions,
  useTeacherLevelOptions,
} from '@/lib/reports/pickers';
import {
  EXPORT_TYPES,
  type ExportType,
  type ExportScope,
  type ExportJob,
} from '@/lib/reports/types';
import { ExportProgress } from './export-progress';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role;
  initialType?: ExportType;
  initialScope?: ExportScope;
  lockType?: boolean;
  contextTitle?: string;
  onSuccess?: (job: ExportJob) => void;
}

const TYPE_LABELS: Record<ExportType, string> = {
  EXAM_RESULTS: 'Exam Results & Marks',
  PARTICIPATION: 'Exam Participation & Attendance',
  STUDENTS: 'Student Directory',
  TEACHERS: 'Staff & Teacher Directory',
  CLASSES: 'Class Groups & Levels',
  QUESTION_BANK: 'Question Bank',
};

const TYPE_DESCRIPTIONS: Record<ExportType, string> = {
  EXAM_RESULTS:
    'Detailed candidate scores, percentages, grades, and statuses (including ABSENT and AUTO-SUBMITTED).',
  PARTICIPATION: 'Candidate participation history and attendance statuses across exam sessions.',
  STUDENTS: 'Enrolled students with Login IDs, admission numbers, names, and email.',
  TEACHERS: 'Teaching staff directory with staff IDs and subject assignments.',
  CLASSES: 'Configured class arms, levels, and academic offerings.',
  QUESTION_BANK:
    'Re-importable CSV of question content, options, answer keys, topics, and difficulty levels.',
};

export function ExportDialog({
  open,
  onOpenChange,
  role = 'SCHOOL_ADMIN',
  initialType = 'EXAM_RESULTS',
  initialScope,
  lockType = false,
  contextTitle,
  onSuccess,
}: ExportDialogProps) {
  const [selectedType, setSelectedType] = useState<ExportType>(initialType);
  const [examId, setExamId] = useState(initialScope?.examId ?? '');
  const [classId, setClassId] = useState(initialScope?.classId ?? '');
  const [subjectId, setSubjectId] = useState(initialScope?.subjectId ?? '');
  const [departmentId, setDepartmentId] = useState(initialScope?.departmentId ?? '');
  const [level, setLevel] = useState(initialScope?.level ?? '');
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const createExport = useCreateExport();

  // Reset or initialize state when opened
  useEffect(() => {
    if (open) {
      setSelectedType(initialType);
      setExamId(initialScope?.examId ?? '');
      setClassId(initialScope?.classId ?? '');
      setSubjectId(initialScope?.subjectId ?? '');
      setDepartmentId(initialScope?.departmentId ?? '');
      setLevel(initialScope?.level ?? '');
      setActiveJob(null);
      setValidationError(null);
    }
  }, [open, initialType, initialScope]);

  // Allowed export types per role
  const allowedTypes = EXPORT_TYPES.filter((type) => {
    if (role === 'TEACHER') {
      return type !== 'TEACHERS'; // Teachers cannot export the teacher directory
    }
    return true;
  });

  function changeDepartment(next: string) {
    setDepartmentId(next);
    // Classes and subjects are listed per department for an HOD.
    setClassId('');
    setSubjectId('');
  }

  function changeSubject(next: string) {
    setSubjectId(next);
    setLevel('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const scope: ExportScope = {};

    if (selectedType === 'EXAM_RESULTS' || selectedType === 'PARTICIPATION') {
      if (!examId) {
        setValidationError('Choose an exam to export.');
        return;
      }
      scope.examId = examId;
    } else if (selectedType === 'QUESTION_BANK') {
      if (role === 'HOD') {
        if (!departmentId) {
          setValidationError('Choose your department.');
          return;
        }
        scope.departmentId = departmentId;
      }
      if (!subjectId) {
        setValidationError('Choose a subject to export.');
        return;
      }
      scope.subjectId = subjectId;
      if (role === 'TEACHER') {
        if (!level) {
          setValidationError('Choose the class level (e.g. JSS1, SS2).');
          return;
        }
        scope.level = level;
      }
    } else if (selectedType === 'STUDENTS' || selectedType === 'CLASSES') {
      if (role === 'HOD') {
        if (!departmentId) {
          setValidationError('Choose your department.');
          return;
        }
        scope.departmentId = departmentId;
      }
      if (role === 'TEACHER' && !classId) {
        setValidationError('Choose one of your classes.');
        return;
      }
      if (classId) scope.classId = classId;
    } else if (selectedType === 'TEACHERS') {
      if (role === 'HOD') {
        if (!departmentId) {
          setValidationError('Choose your department.');
          return;
        }
        scope.departmentId = departmentId;
      }
    }

    try {
      const job = await createExport.mutateAsync({
        type: selectedType,
        ...(Object.keys(scope).length > 0 ? { scope } : {}),
      });
      setActiveJob(job);
      onSuccess?.(job);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to request export.');
    }
  }

  const isExamScoped = selectedType === 'EXAM_RESULTS' || selectedType === 'PARTICIPATION';
  const isQuestionScoped = selectedType === 'QUESTION_BANK';
  const isClassOrStudentScoped = selectedType === 'STUDENTS' || selectedType === 'CLASSES';
  const isTeacherScoped = selectedType === 'TEACHERS';
  const needsDepartment =
    role === 'HOD' && (isQuestionScoped || isClassOrStudentScoped || isTeacherScoped);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {activeJob
              ? 'Export in Progress'
              : `Export ${contextTitle ? `— ${contextTitle}` : 'Data'}`}
          </DialogTitle>
          <DialogDescription>
            {activeJob
              ? 'Your export file is being generated. You can download it as soon as processing completes.'
              : 'Export academic records into CSV format. Academic statuses such as ABSENT and AUTO-SUBMITTED are preserved.'}
          </DialogDescription>
        </DialogHeader>

        {activeJob ? (
          <div className="py-2">
            <ExportProgress jobId={activeJob.id} onDone={() => onOpenChange(false)} />
            <DialogFooter className="mt-4">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
            {validationError && (
              <div
                role="alert"
                className="rounded-md bg-danger-subtle p-3 text-sm text-danger-subtle-foreground"
              >
                {validationError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="export-type">Dataset to Export</Label>
              {lockType ? (
                <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
                  {TYPE_LABELS[selectedType]}
                </div>
              ) : (
                <Select
                  value={selectedType}
                  onValueChange={(val) => setSelectedType(val as ExportType)}
                >
                  <SelectTrigger id="export-type">
                    <SelectValue placeholder="Select dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-text-muted mt-1">{TYPE_DESCRIPTIONS[selectedType]}</p>
            </div>

            {/* Scope pickers — never a raw ID box (2026-10-08 pilot finding) */}
            {isExamScoped &&
              (initialScope?.examId ? (
                <LockedExam examId={initialScope.examId} />
              ) : (
                <ExamField role={role} value={examId} onChange={setExamId} />
              ))}

            {needsDepartment && (
              <DepartmentField role={role} value={departmentId} onChange={changeDepartment} />
            )}

            {isQuestionScoped && (
              <>
                <SubjectField
                  role={role}
                  departmentId={departmentId}
                  value={subjectId}
                  onChange={changeSubject}
                />
                {role === 'TEACHER' && (
                  <LevelField subjectId={subjectId} value={level} onChange={setLevel} />
                )}
              </>
            )}

            {isClassOrStudentScoped && (
              <ClassField
                role={role}
                departmentId={departmentId}
                value={classId}
                onChange={setClassId}
              />
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={createExport.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createExport.isPending}>
                {createExport.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  'Generate CSV'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Each field loads its own list, so a dialog only fetches what its dataset needs.

function ExamField({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: string;
  onChange: (v: string) => void;
}) {
  const exams = useExamOptions(role);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="export-exam">Exam</Label>
      <SearchableSelect
        id="export-exam"
        {...exams}
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        placeholder="Type an exam title, subject or class"
        emptyText="No exam matches."
      />
    </div>
  );
}

function LockedExam({ examId }: { examId: string }) {
  const exam = useExam(examId);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-text-primary">Exam</p>
      <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-medium">
        {exam.data?.title ?? (exam.isLoading ? 'Loading…' : 'This exam')}
      </div>
    </div>
  );
}

function DepartmentField({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: string;
  onChange: (v: string) => void;
}) {
  const departments = useDepartmentOptions(role);
  const only = departments.options.length === 1 ? departments.options[0]?.value : undefined;
  // An HOD who heads one department never has to pick it.
  useEffect(() => {
    if (only && !value) onChange(only);
  }, [only, value, onChange]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="export-department">Department</Label>
      <SearchableSelect
        id="export-department"
        {...departments}
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        placeholder="Type a department name"
        emptyText="You do not head a department that matches."
      />
    </div>
  );
}

function SubjectField({
  role,
  departmentId,
  value,
  onChange,
}: {
  role: Role;
  departmentId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const subjects = useSubjectOptions(role, departmentId);
  const waitingForDepartment = role === 'HOD' && !departmentId;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="export-subject">Subject</Label>
      <SearchableSelect
        id="export-subject"
        {...subjects}
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        disabled={waitingForDepartment}
        placeholder={waitingForDepartment ? 'Choose a department first' : 'Type a subject name'}
        emptyText={role === 'TEACHER' ? 'No subject you teach matches.' : 'No subject matches.'}
      />
    </div>
  );
}

function LevelField({
  subjectId,
  value,
  onChange,
}: {
  subjectId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const levels = useTeacherLevelOptions(subjectId || undefined);
  const only = levels.options.length === 1 ? levels.options[0]?.value : undefined;
  useEffect(() => {
    if (only && !value) onChange(only);
  }, [only, value, onChange]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="export-level">Class Level</Label>
      <SearchableSelect
        id="export-level"
        {...levels}
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        disabled={!subjectId}
        placeholder={subjectId ? 'Type a level, e.g. JSS1' : 'Choose a subject first'}
        emptyText="You do not teach this subject at a matching level."
      />
    </div>
  );
}

function ClassField({
  role,
  departmentId,
  value,
  onChange,
}: {
  role: Role;
  departmentId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const classes = useClassOptions(role, departmentId);
  const required = role === 'TEACHER';
  const waitingForDepartment = role === 'HOD' && !departmentId;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="export-class">
        Class {required ? '' : '(optional, leave blank for all classes)'}
      </Label>
      <SearchableSelect
        id="export-class"
        {...classes}
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        clearable={!required}
        disabled={waitingForDepartment}
        placeholder={
          waitingForDepartment
            ? 'Choose a department first'
            : required
              ? 'Type a class name, e.g. JSS1A'
              : 'All classes, or type a class name'
        }
        emptyText={required ? 'No class you teach matches.' : 'No class matches.'}
      />
    </div>
  );
}
