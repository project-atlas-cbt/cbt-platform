'use client';

import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useStreams } from '@/lib/academics/queries';
import { useSetStudentStream } from '@/lib/academics/mutations';

const NO_STREAM = '__none__';

/** ADR-0038: the student's stream this session. Staff who move students
 * between classes can change it here; the new stream's subjects are
 * registered and the old stream's dropped, for future exams only. Shown as
 * plain text to everyone else, and when the student has no current class. */
export function StudentStreamField({
  studentProfileId,
  streamId,
  streamName,
  editable,
}: {
  studentProfileId: string;
  streamId: string | null;
  streamName: string | null;
  editable: boolean;
}) {
  const streams = useStreams({ enabled: editable });
  const setStream = useSetStudentStream(studentProfileId);
  const options = (streams.data?.streams ?? []).filter(
    (s) => s.status === 'ACTIVE' || s.id === streamId,
  );

  if (!editable || (streams.isSuccess && options.length === 0 && !streamId)) {
    return <span className="text-text-primary">{streamName ?? '—'}</span>;
  }

  return (
    <Select
      value={streamId ?? NO_STREAM}
      disabled={setStream.isPending || streams.isPending}
      onValueChange={(value) => {
        const next = value === NO_STREAM ? null : value;
        const nextName = options.find((s) => s.id === next)?.name;
        setStream.mutate(next, {
          onSuccess: () =>
            toast.success(nextName ? `Moved to ${nextName}` : 'Removed from the stream', {
              description: 'Stream subjects were updated to match.',
            }),
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : 'Could not change the stream.'),
        });
      }}
    >
      <SelectTrigger className="h-8 w-48" aria-label="Stream">
        <SelectValue placeholder="No stream" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_STREAM}>No stream</SelectItem>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
