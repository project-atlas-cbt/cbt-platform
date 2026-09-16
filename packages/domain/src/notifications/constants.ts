/// Persisted in-app operational notification vocabulary.
export const NOTIFICATION_TYPES = [
  'QUESTION_APPROVED',
  'QUESTION_REJECTED',
  'QUESTION_CHANGES_REQUESTED',
  'RESULT_PUBLISHED',
  'EXAM_OPENED',
  'MAKEUP_GRANTED',
  'SUBSCRIPTION_EXPIRING',
  'STUDENTS_UNASSIGNED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** B16 activates MAKEUP_GRANTED; EXAM_OPENED remains intentionally deferred. */
export const DEFERRED_NOTIFICATION_TYPES: readonly NotificationType[] = ['EXAM_OPENED'];

export const NOTIFICATION_STATUSES = ['UNREAD', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
