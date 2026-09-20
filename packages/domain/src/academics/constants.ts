/**
 * B5 — Academic Structure. Hand-kept in sync with the corresponding Prisma
 * enums in packages/db/prisma/schema.prisma, mirroring SCHOOL_STATUSES/
 * SUBSCRIPTION_STATUSES's own precedent (platform/access-gate.ts) — this
 * package has no dependency on @atlas/db (a domain->infra dependency this
 * codebase avoids), so DTO validation (`@IsIn`) and OpenAPI `enum:` metadata
 * need their own string-literal source here rather than importing the
 * Prisma-generated union type.
 */

export const ACADEMIC_SESSION_STATUSES = [
  'DRAFT',
  'UPCOMING',
  'CURRENT',
  'CLOSED',
  'ARCHIVED',
] as const;
export type AcademicSessionStatus = (typeof ACADEMIC_SESSION_STATUSES)[number];

export const ACADEMIC_TERM_STATUSES = [
  'DRAFT',
  'UPCOMING',
  'CURRENT',
  'CLOSED',
  'ARCHIVED',
] as const;
export type AcademicTermStatus = (typeof ACADEMIC_TERM_STATUSES)[number];

export const DEPARTMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

/// ADR-0001: fixed platform-wide controlled vocabulary (confirmed with the
/// project owner during B5 planning) — never a school-editable list, since
/// B8/B9/B11 compare against this value directly.
export const CLASS_LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export const CLASS_GROUP_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type ClassGroupStatus = (typeof CLASS_GROUP_STATUSES)[number];

export const SUBJECT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

export const CLASS_SUBJECT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ClassSubjectStatus = (typeof CLASS_SUBJECT_STATUSES)[number];

export const HOD_ASSIGNMENT_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type HODAssignmentStatus = (typeof HOD_ASSIGNMENT_STATUSES)[number];

export const ROLLOVER_PLAN_STATUSES = ['DRAFT', 'READY', 'COMMITTED'] as const;
export type RolloverPlanStatus = (typeof ROLLOVER_PLAN_STATUSES)[number];

export const ROLLOVER_OUTCOMES = ['PROMOTE', 'REPEAT', 'TRANSFER', 'GRADUATE', 'WITHDRAW'] as const;
export type RolloverOutcome = (typeof ROLLOVER_OUTCOMES)[number];
