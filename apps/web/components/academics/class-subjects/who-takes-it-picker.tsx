'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClassSubjectKind } from '@/lib/academics/mutations';

export interface WhoTakesIt {
  kind: ClassSubjectKind;
  streamIds: string[];
}

export function whoTakesItLabel(value: WhoTakesIt, streams: { id: string; name: string }[]) {
  if (value.kind === 'COMPULSORY') return 'Compulsory';
  const names = streams.filter((s) => value.streamIds.includes(s.id)).map((s) => s.name);
  if (names.length === 0) return 'Elective';
  return `${names.join(', ')} ${names.length === 1 ? 'stream' : 'streams'}`;
}

/** ADR-0038: who takes an offering. Compulsory is everyone in the class; an
 * elective with streams is everyone in those streams; a plain elective is
 * only the students staff choose. Streams are ticked, so one subject can
 * serve several streams (Economics for Business and Humanities). */
export function WhoTakesItPicker({
  value,
  onChange,
  streams,
  label,
  disabled,
}: {
  value: WhoTakesIt;
  onChange: (next: WhoTakesIt) => void;
  streams: { id: string; name: string }[];
  /** Accessible name, e.g. "Who takes Physics". */
  label: string;
  disabled?: boolean;
}) {
  const toggleStream = (id: string) => {
    const streamIds = value.streamIds.includes(id)
      ? value.streamIds.filter((s) => s !== id)
      : [...value.streamIds, id];
    onChange({ kind: 'ELECTIVE', streamIds });
  };
  const plainElective = value.kind === 'ELECTIVE' && value.streamIds.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="min-w-36 justify-between"
          aria-label={`${label}: ${whoTakesItLabel(value, streams)}`}
          disabled={disabled}
        >
          <span className="truncate">{whoTakesItLabel(value, streams)}</span>
          <ChevronDown aria-hidden className="size-4 text-text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuCheckboxItem
          checked={value.kind === 'COMPULSORY'}
          onCheckedChange={() => onChange({ kind: 'COMPULSORY', streamIds: [] })}
        >
          <span className="flex flex-col">
            <span>Compulsory</span>
            <span className="text-xs text-text-muted">Every student in the class</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={plainElective}
          onCheckedChange={() => onChange({ kind: 'ELECTIVE', streamIds: [] })}
        >
          <span className="flex flex-col">
            <span>Elective</span>
            <span className="text-xs text-text-muted">Only the students you choose</span>
          </span>
        </DropdownMenuCheckboxItem>
        {streams.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Everyone in a stream</DropdownMenuLabel>
            {streams.map((s) => (
              <DropdownMenuCheckboxItem
                key={s.id}
                checked={value.kind === 'ELECTIVE' && value.streamIds.includes(s.id)}
                // Stay open so several streams can be ticked in one go.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleStream(s.id)}
              >
                {s.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
