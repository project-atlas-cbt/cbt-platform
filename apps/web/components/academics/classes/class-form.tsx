'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CLASS_LEVELS } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { useClassRoster, useStreams } from '@/lib/academics/queries';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCreateClass } from '@/lib/onboarding/mutations';
import { useUpdateClass } from '@/lib/academics/mutations';

// Radix `Select` can't hold an empty-string item value.
const NO_STREAM = '__none__';

const schema = z.object({
  name: z.string().min(1, 'Enter a class name, e.g. "SS2A".'),
  level: z.enum(CLASS_LEVELS, { message: 'Select a level.' }),
  arm: z.string().min(1, 'Enter an arm, e.g. "A".'),
  defaultStreamId: z.string(),
});
type Values = z.infer<typeof schema>;

/** AC-04 (`05 §7.4`). Raw `CLASS_LEVELS` values render with no label-
 * humanization layer, matching the onboarding wizard's own established
 * precedent — don't invent a second convention. `academicSessionId` is
 * identity-bearing (session-scoped class), so it's fixed at creation
 * (`sessionId` prop) and never offered as an editable field. */
export function ClassForm({
  sessionId,
  classGroup,
  onSaved,
}: {
  sessionId: string;
  classGroup?: {
    id: string;
    name: string;
    level: (typeof CLASS_LEVELS)[number];
    arm: string;
    defaultStreamId: string | null;
  };
  onSaved: () => void;
}) {
  const streams = useStreams();
  const roster = useClassRoster(classGroup?.id);
  // ADR-0038: when an existing class gets a stream, its students in no
  // stream can join it in the same save.
  const [placeStudents, setPlaceStudents] = useState(true);
  const createClass = useCreateClass();
  const updateClass = useUpdateClass(classGroup?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: classGroup?.name ?? '',
      level: classGroup?.level ?? CLASS_LEVELS[0],
      arm: classGroup?.arm ?? '',
      defaultStreamId: classGroup?.defaultStreamId ?? NO_STREAM,
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const defaultStreamId = values.defaultStreamId !== NO_STREAM ? values.defaultStreamId : null;
    try {
      if (classGroup) {
        await updateClass.mutateAsync({
          name: values.name,
          level: values.level,
          arm: values.arm,
          defaultStreamId,
          ...(defaultStreamId && unstreamed > 0 && placeStudents
            ? { placeStudentsWithoutStream: true }
            : {}),
        });
      } else {
        await createClass.mutateAsync({
          academicSessionId: sessionId,
          name: values.name,
          level: values.level,
          arm: values.arm,
          ...(defaultStreamId ? { defaultStreamId } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the class.');
    }
  }

  const isSubmitting = createClass.isPending || updateClass.isPending;
  // An inactive stream can't be picked, but stays listed while it is this
  // class's current one so the form shows the truth.
  const chosenStream = useWatch({ control: form.control, name: 'defaultStreamId' });
  const chosenStreamName = streams.data?.streams.find((st) => st.id === chosenStream)?.name;
  const unstreamed =
    classGroup && chosenStream !== NO_STREAM && chosenStream !== classGroup.defaultStreamId
      ? (roster.data?.students ?? []).filter((st) => !st.streamId).length
      : 0;
  const streamOptions = (streams.data?.streams ?? []).filter(
    (s) => s.status === 'ACTIVE' || s.id === classGroup?.defaultStreamId,
  );

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Level</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
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
          <FormField
            control={form.control}
            name="arm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Arm</FormLabel>
                <FormControl>
                  <Input placeholder="A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Class name</FormLabel>
                <FormControl>
                  <Input placeholder="SS2A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="defaultStreamId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stream (optional)</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="No stream" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_STREAM}>No stream</SelectItem>
                  {streamOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Students added to this class join this stream. You can change any student’s stream
                later. Junior classes usually have none.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {unstreamed > 0 && chosenStreamName ? (
          <div className="flex items-start gap-2">
            <Checkbox
              id="place-unstreamed"
              checked={placeStudents}
              onCheckedChange={(v) => setPlaceStudents(v === true)}
            />
            <Label htmlFor="place-unstreamed" className="text-sm font-normal leading-snug">
              Also put the {unstreamed === 1 ? 'student' : `${unstreamed} students`} in this class
              with no stream in {chosenStreamName}. Students already in a stream keep theirs.
            </Label>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          {classGroup ? 'Save changes' : 'Create class'}
        </Button>
      </form>
    </Form>
  );
}
