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
import { Input } from '@/components/ui/input';
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
  STUDENTS: 'Enrolled students with admission numbers, names, and contact details.',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const scope: ExportScope = {};

    if (selectedType === 'EXAM_RESULTS' || selectedType === 'PARTICIPATION') {
      if (!examId.trim()) {
        setValidationError('An Exam ID is required for this export.');
        return;
      }
      scope.examId = examId.trim();
    } else if (selectedType === 'QUESTION_BANK') {
      if (!subjectId.trim()) {
        setValidationError('A Subject ID is required for Question Bank export.');
        return;
      }
      scope.subjectId = subjectId.trim();
      if (role === 'HOD') {
        if (!departmentId.trim()) {
          setValidationError('Department ID is required for HOD question export.');
          return;
        }
        scope.departmentId = departmentId.trim();
      }
      if (role === 'TEACHER') {
        if (!level.trim()) {
          setValidationError(
            'Class level (e.g. SS1, JSS3) is required for Teacher question export.',
          );
          return;
        }
        scope.level = level.trim();
      }
    } else if (selectedType === 'STUDENTS' || selectedType === 'CLASSES') {
      if (role === 'TEACHER' && !classId.trim()) {
        setValidationError('Class ID is required for Teacher exports.');
        return;
      }
      if (classId.trim()) scope.classId = classId.trim();
      if (departmentId.trim()) scope.departmentId = departmentId.trim();
    } else if (selectedType === 'TEACHERS') {
      if (role === 'HOD') {
        if (!departmentId.trim()) {
          setValidationError('Department ID is required for HOD staff export.');
          return;
        }
        scope.departmentId = departmentId.trim();
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
              <div className="rounded-md bg-danger-subtle p-3 text-sm text-danger-subtle-foreground">
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

            {/* Scope Inputs */}
            {isExamScoped && (
              <div className="space-y-1.5">
                <Label htmlFor="export-exam-id">Exam ID</Label>
                <Input
                  id="export-exam-id"
                  value={examId}
                  onChange={(e) => setExamId(e.target.value)}
                  placeholder="e.g. 019551a0-..."
                  readOnly={Boolean(initialScope?.examId)}
                  className={initialScope?.examId ? 'bg-surface-muted' : ''}
                />
              </div>
            )}

            {isQuestionScoped && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="export-subject-id">Subject ID</Label>
                  <Input
                    id="export-subject-id"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    placeholder="Subject UUID"
                  />
                </div>
                {role === 'TEACHER' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="export-level">Class Level</Label>
                    <Input
                      id="export-level"
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      placeholder="e.g. SS1, SS2, JSS3"
                    />
                  </div>
                )}
                {role === 'HOD' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="export-department-id">Department ID</Label>
                    <Input
                      id="export-department-id"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      placeholder="Department UUID"
                    />
                  </div>
                )}
              </>
            )}

            {isClassOrStudentScoped && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="export-class-id">
                    Class ID{' '}
                    {role === 'TEACHER' ? '(Required)' : '(Optional — leave blank for all classes)'}
                  </Label>
                  <Input
                    id="export-class-id"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    placeholder="Class UUID"
                  />
                </div>
                {role === 'HOD' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="export-department-id">Department ID (Optional)</Label>
                    <Input
                      id="export-department-id"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      placeholder="Department UUID"
                    />
                  </div>
                )}
              </>
            )}

            {isTeacherScoped && role === 'HOD' && (
              <div className="space-y-1.5">
                <Label htmlFor="export-department-id">Department ID</Label>
                <Input
                  id="export-department-id"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  placeholder="Department UUID"
                />
              </div>
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
