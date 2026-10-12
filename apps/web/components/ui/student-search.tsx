'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * One search box for every list of students. The student ID is the
 * identifier staff rely on, so the placeholder and the matching put it first.
 * The box is controlled and holds no selection state, so a list that keeps
 * ticked students keeps them while the search narrows what is shown.
 */
export function StudentSearch({
  value,
  onChange,
  className,
  label = 'Search students',
  placeholder = 'Search by student ID or name',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className={cn('relative min-w-48 flex-1', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8"
      />
    </div>
  );
}

/**
 * Every word typed must appear in the student ID or the name, in any order
 * and case ("ola 0042", "0042 ade"). A blank query keeps everyone. Mirrors the
 * server's student search so a list filtered here and one filtered by the API
 * agree.
 */
export function matchesStudent(query: string, studentId: string, name: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const id = studentId.toLowerCase();
  const nm = name.toLowerCase();
  return words.every((word) => id.includes(word) || nm.includes(word));
}

export function filterStudents<T>(
  rows: T[],
  query: string,
  get: (row: T) => { studentId: string; name: string },
): T[] {
  if (query.trim() === '') return rows;
  return rows.filter((row) => {
    const { studentId, name } = get(row);
    return matchesStudent(query, studentId, name);
  });
}
