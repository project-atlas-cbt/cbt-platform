'use client';

import { CLASS_LEVELS, QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@atlas/domain';
import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useDepartments, useSubjects } from '@/lib/academics/queries';
import type { QuestionFormValues } from '@/lib/questions/validation';
import { TopicCombobox } from './topic-combobox';

const QUESTION_TYPE_LABELS: Record<(typeof QUESTION_TYPES)[number], string> = {
  SINGLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / False',
};

/**
 * F9 — `MetadataPanel`: Subject/Level/Topic/Subtopic/Difficulty/Marks/
 * Explanation, plus a read-only Department label derived from the chosen
 * Subject (`05 §15.3` lists "Department" as a Question Creation field, but
 * it isn't independently settable — `Question.subjectId` is the only
 * academic-scope input the DTO accepts; Department is shown for context,
 * never editable, mirroring F6's `SubjectForm`'s own department-derivation
 * precedent).
 *
 * Subject/Level are built unconstrained (no client-side teacher-assignment
 * data is reachable — see the F9 plan's own investigated conclusion): a
 * teacher who picks outside their real scope gets the server's own
 * `QUESTION_OUT_OF_SCOPE` message via `outOfScopeError`, rendered inline
 * here rather than as a generic toast.
 */
export function MetadataPanel({
  form,
  disabled = false,
  outOfScopeError,
}: {
  form: UseFormReturn<QuestionFormValues>;
  disabled?: boolean;
  outOfScopeError?: string | null;
}) {
  const subjects = useSubjects();
  const departments = useDepartments();
  const subjectId = form.watch('subjectId');
  const topicId = form.watch('topicId');
  const selectedSubject = subjects.data?.subjects.find((s) => s.id === subjectId);
  const selectedDepartment = departments.data?.departments.find(
    (d) => d.id === selectedSubject?.departmentId,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="subjectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <Select
                value={field.value}
                disabled={disabled}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue('topicId', undefined);
                  form.setValue('subtopicId', undefined);
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(subjects.data?.subjects ?? []).map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Class level</FormLabel>
              <Select value={field.value} disabled={disabled} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CLASS_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {outOfScopeError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {outOfScopeError}
        </p>
      ) : null}

      <div>
        <Label>Department</Label>
        <p className="text-sm text-text-secondary">
          {selectedSubject?.departmentId ? (selectedDepartment?.name ?? '—') : 'No department'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TopicCombobox
          label="Topic (optional)"
          subjectId={subjectId}
          value={topicId}
          onChange={(topic) => form.setValue('topicId', topic?.id)}
          placeholder="e.g. Quadratic Equations"
          disabled={disabled}
        />
        <TopicCombobox
          label="Subtopic (optional)"
          subjectId={subjectId}
          {...(topicId ? { parentTopicId: topicId } : {})}
          value={form.watch('subtopicId')}
          onChange={(topic) => form.setValue('subtopicId', topic?.id)}
          placeholder={topicId ? 'e.g. Factoring' : 'Select a topic first'}
          disabled={disabled || !topicId}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="questionType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question type</FormLabel>
              <Select value={field.value} disabled={disabled} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {QUESTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {QUESTION_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="difficulty"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Difficulty</FormLabel>
              <Select value={field.value} disabled={disabled} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {QUESTION_DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="marks"
        render={({ field }) => (
          <FormItem className="max-w-32">
            <FormLabel>Marks</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                max={100}
                disabled={disabled}
                value={field.value}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="explanation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Explanation (optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Shown to a student after marking, if your school enables it."
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
