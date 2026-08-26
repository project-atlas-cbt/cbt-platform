/**
 * ADR-0012: "a distinct, monitorable code path rather than an invisible
 * superuser bypass." Tested against constructed actors, not a real
 * Software Admin login — see CLAUDE.md's 2026-08-26 decision.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuditService } from '../operations/audit-event.service.js';
import { BreakGlassService } from './break-glass.service.js';
import type { AuthorizedActor } from './authorization.types.js';

const softwareAdmin: AuthorizedActor = {
  kind: 'PLATFORM',
  userId: 'platform-user-1',
  roles: ['SOFTWARE_ADMIN'],
};
const schoolAdmin: AuthorizedActor = {
  kind: 'SCHOOL',
  userId: 'user-1',
  schoolId: 'school-a',
  membershipId: 'membership-1',
  roles: ['SCHOOL_ADMIN'],
};

describe('BreakGlassService.execute', () => {
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: BreakGlassService;

  beforeEach(() => {
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new BreakGlassService(audit as unknown as AuditService);
  });

  it('rejects a non-Software-Admin actor before running the operation', async () => {
    const fn = vi.fn();
    await expect(
      service.execute(
        schoolAdmin,
        { schoolId: 'school-a', permissionId: 'examAdmin.invalidateAttempt', reason: 'x' },
        fn,
      ),
    ).rejects.toThrow(AppHttpException);
    expect(fn).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a permission id whose Software Admin grant is not BREAK_GLASS', async () => {
    const fn = vi.fn();
    await expect(
      service.execute(
        softwareAdmin,
        { schoolId: 'school-a', permissionId: 'questionBank.approve', reason: 'x' },
        fn,
      ),
    ).rejects.toThrow(/not a break-glass-eligible action/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects an empty or whitespace-only reason', async () => {
    const fn = vi.fn();
    await expect(
      service.execute(
        softwareAdmin,
        { schoolId: 'school-a', permissionId: 'examAdmin.invalidateAttempt', reason: '   ' },
        fn,
      ),
    ).rejects.toThrow(/reason is required/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs the operation and records an elevated, distinctly-typed AuditEvent for the target school (DoD item 9)', async () => {
    const fn = vi.fn().mockResolvedValue('the-result');
    const result = await service.execute(
      softwareAdmin,
      {
        schoolId: 'school-b',
        permissionId: 'examAdmin.invalidateAttempt',
        reason: 'Student reported a technical fault during the exam.',
        entityType: 'ExamAttempt',
        entityId: 'attempt-1',
      },
      fn,
    );

    expect(result).toBe('the-result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-b',
        actorUserId: 'platform-user-1',
        actorRole: 'SOFTWARE_ADMIN',
        breakGlass: true,
        reason: 'Student reported a technical fault during the exam.',
        entityType: 'ExamAttempt',
        entityId: 'attempt-1',
      }),
    );
    const call = audit.record.mock.calls[0]![0] as { action: string };
    expect(call.action).toMatch(/^BREAK_GLASS_/);
  });

  it('does not record an AuditEvent if the wrapped operation throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      service.execute(
        softwareAdmin,
        { schoolId: 'school-a', permissionId: 'examAdmin.invalidateAttempt', reason: 'x' },
        fn,
      ),
    ).rejects.toThrow('boom');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
