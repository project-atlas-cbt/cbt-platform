export interface RetentionPolicy {
  expiredSessionRetentionDays: number;
  expiredPasswordResetRetentionDays: number;
}

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
