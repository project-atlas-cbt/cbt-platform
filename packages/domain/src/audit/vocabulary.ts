export interface CanonicalAuditAction {
  id: string;
  label: string;
  status: 'LIVE' | 'DEFERRED';
  aliases: string[];
  owningPhase?: string;
}

/** Canonical 07 §11.1 audit moments. B16 supplies the final two deferred producers. */
export const CANONICAL_AUDIT_ACTIONS: readonly CanonicalAuditAction[] = [
  {
    id: 'QUESTION_APPROVED',
    label: 'Question approved',
    status: 'LIVE',
    aliases: ['QUESTION_APPROVED'],
  },
  {
    id: 'QUESTION_REJECTED',
    label: 'Question rejected',
    status: 'LIVE',
    aliases: ['QUESTION_REJECTED'],
  },
  {
    id: 'EXAM_READY',
    label: 'Exam ready for activation',
    status: 'LIVE',
    aliases: ['EXAM_READY'],
  },
  {
    id: 'EXAM_OPENED',
    label: 'Exam opened',
    status: 'LIVE',
    aliases: ['EXAM_OPENED'],
  },
  {
    id: 'EXAM_CLOSED',
    label: 'Exam closed',
    status: 'LIVE',
    aliases: ['EXAM_CLOSED'],
  },
  {
    id: 'MAKEUP_GRANTED',
    label: 'Makeup access granted',
    status: 'LIVE',
    aliases: ['MAKEUP_GRANTED'],
  },
  {
    id: 'ATTEMPT_INVALIDATED',
    label: 'Attempt invalidated',
    status: 'LIVE',
    aliases: ['ATTEMPT_INVALIDATED'],
  },
  {
    id: 'RESULT_PUBLISHED',
    label: 'Result published',
    status: 'LIVE',
    aliases: ['RESULT_PUBLISHED', 'RESULT_UNPUBLISHED'],
  },
  {
    id: 'RESULT_ADJUSTED',
    label: 'Result adjusted',
    status: 'LIVE',
    aliases: [
      'RESULT_ADJUSTED',
      'RESULT_MANUAL_OVERRIDE',
      'RESULT_WITHHELD',
      'RESULT_RELEASED',
    ],
  },
  {
    id: 'USER_DEACTIVATED',
    label: 'User account deactivated',
    status: 'LIVE',
    aliases: ['STUDENT_DEACTIVATED', 'TEACHER_DEACTIVATED', 'MODERATOR_REMOVED'],
  },
  {
    id: 'CLASS_CHANGED',
    label: 'Student moved to a different class',
    status: 'LIVE',
    aliases: ['CLASS_CHANGED'],
  },
  {
    id: 'TEACHER_ASSIGNED',
    label: 'Teacher assigned to class/subject',
    status: 'LIVE',
    aliases: ['TEACHER_ASSIGNMENTS_REPLACED'],
  },
];

export const DEFERRED_AUDIT_ACTION_IDS: readonly string[] = CANONICAL_AUDIT_ACTIONS.filter(
  (action) => action.status === 'DEFERRED',
).map((action) => action.id);
