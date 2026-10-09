import { Badge, type BadgeProps } from '@/components/ui/badge';
import type {
  AcademicSessionStatus,
  AcademicTermStatus,
  DepartmentStatus,
  ClassGroupStatus,
  SubjectStatus,
} from '@atlas/domain';

/**
 * Doctrine §7 ("Badges"): one consistent badge component, colour mapped to
 * semantic meaning, never invented per-screen — mirrors
 * `components/platform/status-badges.tsx`'s own `Record<Status,{label,
 * status}>` pattern exactly, for the five academic-structure lifecycle
 * enums (07 §6.1-§6.9's DRAFT/UPCOMING/CURRENT/CLOSED/ARCHIVED family plus
 * the ACTIVE/INACTIVE pairs).
 */

// `AcademicSessionStatus` and `AcademicTermStatus` are the identical
// DRAFT/UPCOMING/CURRENT/CLOSED/ARCHIVED literal union (`packages/domain`'s
// own two separately-named exports for two separately-named lifecycles) —
// one shared meta record indexed by either type, not a duplicated union.
const SESSION_TERM_STATUS_META: Record<
  AcademicSessionStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  DRAFT: { label: 'Draft', status: 'neutral' },
  UPCOMING: { label: 'Upcoming', status: 'info' },
  CURRENT: { label: 'Current', status: 'success' },
  CLOSED: { label: 'Closed', status: 'neutral' },
  ARCHIVED: { label: 'Archived', status: 'neutral' },
};

export function SessionStatusBadge({ value }: { value: AcademicSessionStatus }) {
  const meta = SESSION_TERM_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

export function TermStatusBadge({ value }: { value: AcademicTermStatus }) {
  const meta = SESSION_TERM_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const DEPARTMENT_STATUS_META: Record<
  DepartmentStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ACTIVE: { label: 'Active', status: 'success' },
  INACTIVE: { label: 'Inactive', status: 'neutral' },
};

export function DepartmentStatusBadge({ value }: { value: DepartmentStatus }) {
  const meta = DEPARTMENT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const CLASS_STATUS_META: Record<ClassGroupStatus, { label: string; status: BadgeProps['status'] }> =
  {
    ACTIVE: { label: 'Active', status: 'success' },
    INACTIVE: { label: 'Inactive', status: 'neutral' },
    ARCHIVED: { label: 'Archived', status: 'neutral' },
  };

export function ClassStatusBadge({ value }: { value: ClassGroupStatus }) {
  const meta = CLASS_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const SUBJECT_STATUS_META: Record<SubjectStatus, { label: string; status: BadgeProps['status'] }> =
  {
    ACTIVE: { label: 'Active', status: 'success' },
    INACTIVE: { label: 'Inactive', status: 'neutral' },
  };

export function SubjectStatusBadge({ value }: { value: SubjectStatus }) {
  const meta = SUBJECT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

/** ADR-0038: a stream is Active or Inactive, the same pair as a department. */
export function StreamStatusBadge({ value }: { value: 'ACTIVE' | 'INACTIVE' }) {
  const meta = DEPARTMENT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
