/// B7 (Bulk Import Pipeline) — mirrors `packages/db/prisma/schema.prisma`'s
/// ImportJobType/ImportJobStatus/ImportRowStatus enums, the same
/// const-array-plus-derived-type pattern every other domain module in this
/// package already uses (academics/constants.ts, people/constants.ts) so
/// DTOs never redefine or drift from the schema's own vocabulary.

export const IMPORT_JOB_TYPES = ['STUDENTS', 'TEACHERS'] as const;
export type ImportJobType = (typeof IMPORT_JOB_TYPES)[number];

export const IMPORT_JOB_STATUSES = [
  'PENDING_VALIDATION',
  'VALIDATING',
  'VALIDATED',
  'IMPORTING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROW_STATUSES = ['VALID', 'INVALID', 'COMMITTED', 'FAILED'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];
