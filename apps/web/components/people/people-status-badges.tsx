import { Badge, type BadgeProps } from '@/components/ui/badge';
import type {
  EmploymentStatus,
  MembershipStatus,
  StudentEnrollmentStatus,
  StudentProfileStatus,
  StudentSubjectRegistrationStatus,
  TeacherAssignmentStatus,
  UserStatus,
} from '@atlas/domain';

/**
 * F7 — mirrors `academic-status-badges.tsx`'s (F6) `Record<Status,{label,
 * status}>` pattern exactly, for every people-lifecycle enum a directory or
 * profile screen needs to render.
 */

const USER_STATUS_META: Record<UserStatus, { label: string; status: BadgeProps['status'] }> = {
  INVITED: { label: 'Invited', status: 'info' },
  ACTIVE: { label: 'Active', status: 'success' },
  SUSPENDED: { label: 'Suspended', status: 'warning' },
  INACTIVE: { label: 'Inactive', status: 'neutral' },
};

export function UserStatusBadge({ value }: { value: UserStatus }) {
  const meta = USER_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const MEMBERSHIP_STATUS_META: Record<
  MembershipStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  PENDING: { label: 'Pending', status: 'info' },
  ACTIVE: { label: 'Active', status: 'success' },
  INACTIVE: { label: 'Inactive', status: 'neutral' },
  ENDED: { label: 'Ended', status: 'neutral' },
};

export function MembershipStatusBadge({ value }: { value: MembershipStatus }) {
  const meta = MEMBERSHIP_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const STUDENT_PROFILE_STATUS_META: Record<
  StudentProfileStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ACTIVE: { label: 'Active', status: 'success' },
  GRADUATED: { label: 'Graduated', status: 'info' },
  WITHDRAWN: { label: 'Withdrawn', status: 'neutral' },
  ARCHIVED: { label: 'Archived', status: 'neutral' },
};

export function StudentProfileStatusBadge({ value }: { value: StudentProfileStatus }) {
  const meta = STUDENT_PROFILE_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const EMPLOYMENT_STATUS_META: Record<
  EmploymentStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ACTIVE: { label: 'Active', status: 'success' },
  ENDED: { label: 'Ended', status: 'neutral' },
};

export function EmploymentStatusBadge({ value }: { value: EmploymentStatus }) {
  const meta = EMPLOYMENT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const ENROLLMENT_STATUS_META: Record<
  StudentEnrollmentStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ACTIVE: { label: 'Current', status: 'success' },
  TRANSFERRED: { label: 'Transferred', status: 'neutral' },
  COMPLETED: { label: 'Completed', status: 'info' },
  WITHDRAWN: { label: 'Withdrawn', status: 'neutral' },
};

export function EnrollmentStatusBadge({ value }: { value: StudentEnrollmentStatus }) {
  const meta = ENROLLMENT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const ASSIGNMENT_STATUS_META: Record<
  TeacherAssignmentStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ACTIVE: { label: 'Active', status: 'success' },
  ENDED: { label: 'Ended', status: 'neutral' },
};

export function AssignmentStatusBadge({ value }: { value: TeacherAssignmentStatus }) {
  const meta = ASSIGNMENT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const REGISTRATION_STATUS_META: Record<
  StudentSubjectRegistrationStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  REGISTERED: { label: 'Registered', status: 'success' },
  DEREGISTERED: { label: 'Deregistered', status: 'neutral' },
};

export function RegistrationStatusBadge({ value }: { value: StudentSubjectRegistrationStatus }) {
  const meta = REGISTRATION_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
