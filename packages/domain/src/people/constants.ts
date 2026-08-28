/**
 * B1 (identity) + B6 (people, profiles & enrollment). Hand-kept in sync with
 * the corresponding Prisma enums in packages/db/prisma/schema.prisma,
 * mirroring academics/constants.ts's own precedent — this package has no
 * dependency on @atlas/db, so DTO validation (`@IsIn`) and OpenAPI `enum:`
 * metadata need their own string-literal source here rather than importing
 * the Prisma-generated union type.
 */

/// Account status (07 §5.1's "account status" half — see CredentialState for
/// the "authentication state" half, a deliberately separate B1 enum per
/// audit C-14). Deactivate/reactivate toggle ACTIVE <-> INACTIVE.
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/// Academic standing only (audit C-14's resolution) — never consulted by
/// login itself. Combined with UserStatus above, this satisfies B6's own
/// roadmap-listed lifecycle (INVITED -> ACTIVE -> SUSPENDED -> INACTIVE ->
/// GRADUATED -> ARCHIVED) exactly as C-14 intended: no enum extension
/// needed here.
export const STUDENT_PROFILE_STATUSES = ['ACTIVE', 'GRADUATED', 'WITHDRAWN', 'ARCHIVED'] as const;
export type StudentProfileStatus = (typeof STUDENT_PROFILE_STATUSES)[number];

export const EMPLOYMENT_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/// 07 §6.7's literal state list. TRANSFERRED marks a superseded enrollment
/// after a same-session class move (07 §35) — the row is never deleted or
/// overwritten, only closed.
export const STUDENT_ENROLLMENT_STATUSES = [
  'ACTIVE',
  'TRANSFERRED',
  'COMPLETED',
  'WITHDRAWN',
] as const;
export type StudentEnrollmentStatus = (typeof STUDENT_ENROLLMENT_STATUSES)[number];

export const TEACHER_ASSIGNMENT_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type TeacherAssignmentStatus = (typeof TEACHER_ASSIGNMENT_STATUSES)[number];

/// ADR-0011. A Moderator can deregister a student from an elective and
/// re-register them; deregistration takes effect for future exams only.
export const STUDENT_SUBJECT_REGISTRATION_STATUSES = ['REGISTERED', 'DEREGISTERED'] as const;
export type StudentSubjectRegistrationStatus =
  (typeof STUDENT_SUBJECT_REGISTRATION_STATUSES)[number];
