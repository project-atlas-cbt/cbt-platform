import { describe, expect, it } from 'vitest';
import { pollingInterval, type ImportJobStatus } from './queries';

/**
 * Regression coverage for the bug this session's review found: a freshly
 * created job is briefly `PENDING_VALIDATION` before the BullMQ worker
 * dequeues it (`ImportValidationService.validate`'s own guard accepts either
 * `PENDING_VALIDATION` or `VALIDATING`), and the very first `GET
 * /imports/:id` fetch can land inside that window. `pollingInterval`
 * originally only polled on `VALIDATING`, so a job caught in that window
 * stopped refetching forever — with `refetchOnWindowFocus: false` app-wide,
 * there was no other recovery path short of a manual page reload.
 */
describe('pollingInterval', () => {
  it('polls while the job is still pending validation, not just while validating', () => {
    expect(pollingInterval('PENDING_VALIDATION')).toBe(2000);
    expect(pollingInterval('VALIDATING')).toBe(2000);
  });

  it('polls while importing, on the slower cadence', () => {
    expect(pollingInterval('IMPORTING')).toBe(5000);
  });

  it('stops polling for every resting/terminal status', () => {
    const resting: ImportJobStatus[] = ['VALIDATED', 'COMPLETED', 'FAILED', 'EXPIRED'];
    for (const status of resting) {
      expect(pollingInterval(status)).toBe(false);
    }
  });

  it('stops polling when there is no status yet', () => {
    expect(pollingInterval(undefined)).toBe(false);
  });
});
