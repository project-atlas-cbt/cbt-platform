export const PARTICIPATION_STATUSES = [
  'PENDING',
  'ATTENDED',
  'COMPLETED',
  'ABSENT',
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export const ATTEMPT_AUTHORIZATION_TYPES = ['MAKEUP', 'RETRY'] as const;
export type AttemptAuthorizationType = (typeof ATTEMPT_AUTHORIZATION_TYPES)[number];

export const ATTEMPT_AUTHORIZATION_STATUSES = [
  'AUTHORIZED',
  'USED',
  'REVOKED',
  'EXPIRED',
] as const;
export type AttemptAuthorizationStatus = (typeof ATTEMPT_AUTHORIZATION_STATUSES)[number];

export const ATTEMPT_PARTICIPATION_CLASSIFICATIONS = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'INCOMPLETE',
  'ABSENT',
  'INVALIDATED',
] as const;
export type AttemptParticipationClassification =
  (typeof ATTEMPT_PARTICIPATION_CLASSIFICATIONS)[number];

export function classifyAttemptParticipation(input: {
  participationStatus?: ParticipationStatus | null;
  attemptState?:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'AUTO_SUBMITTED'
    | 'INVALIDATED'
    | 'CANCELLED'
    | null;
}): AttemptParticipationClassification {
  if (input.participationStatus === 'ABSENT') return 'ABSENT';
  if (input.attemptState === 'INVALIDATED') return 'INVALIDATED';
  if (
    input.attemptState === 'SUBMITTED' ||
    input.attemptState === 'AUTO_SUBMITTED' ||
    input.participationStatus === 'COMPLETED'
  ) {
    return 'COMPLETED';
  }
  if (input.attemptState === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (input.attemptState === 'CANCELLED' || input.participationStatus === 'ATTENDED') {
    return 'INCOMPLETE';
  }
  return 'PENDING';
}
