/// B10 (Audit & Notifications) — mirrors
/// `packages/db/prisma/schema.prisma`'s NotificationType/NotificationStatus
/// enums, the same const-array-plus-derived-type pattern every other domain
/// module in this package already uses (exams/constants.ts,
/// questions/constants.ts) so DTOs never redefine or drift from the
/// schema's own vocabulary.
///
/// Not to be confused with `@atlas/notifications` (packages/notifications)
/// — that package is the ADR-0019 out-of-band channel/template abstraction
/// (email today); this one is the in-app, persisted `Notification` row's
/// own vocabulary. A notification of any type here is always written
/// in-app; only some types additionally dispatch out-of-band through that
/// separate package's `NotificationChannel`.
export const NOTIFICATION_TYPES = [
  'QUESTION_APPROVED',
  'QUESTION_REJECTED',
  'QUESTION_CHANGES_REQUESTED',
  /// DEFERRED — no producer until B15 (Result Publication).
  'RESULT_PUBLISHED',
  /// DEFERRED — no producer until B12 (Exam Activation & Control).
  'EXAM_OPENED',
  /// B16: written when a staff member grants makeup access.
  'MAKEUP_GRANTED',
  'SUBSCRIPTION_EXPIRING',
  'STUDENTS_UNASSIGNED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/// The NOTIFICATION_TYPES values with no real producer yet — asserted by a
/// dedicated test so a future phase can't add a producer without this list
/// (and the vocabulary.ts coverage mechanism's own equivalent list) being
/// updated deliberately.
///
/// RESULT_PUBLISHED left this list in B15: ResultPublicationService and
/// apps/worker's AUTOMATIC-policy finalisation both now notify the students
/// whose results a release actually made visible.
export const DEFERRED_NOTIFICATION_TYPES: readonly NotificationType[] = ['EXAM_OPENED'];

export const NOTIFICATION_STATUSES = ['UNREAD', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
