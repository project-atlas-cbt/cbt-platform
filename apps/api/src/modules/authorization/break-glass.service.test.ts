/**
 * ADR-0012: "a distinct, monitorable code path rather than an invisible
 * superuser bypass." Tested against constructed actors, not a real
 * Software Admin login — see CLAUDE.md's 2026-08-26 decision.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// B20: execute() now runs the action and its audit row in one tenant
// transaction — the unit test stands in a fake transaction for withTenant.
vi.mock('@atlas/db', () => ({
  prisma: {},
  withTenant: (_client: unknown, _schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({ fakeTx: true }),
}));

import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuditService } from '../operations/audit-event.service.js';
import type { OperationalAlertService } from '../../notifications/operational-alert.service.js';
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
  let audit: { recordInTx: ReturnType<typeof vi.fn> };
  let alerts: { dispatch: ReturnType<typeof vi.fn> };
  let service: BreakGlassService;

  beforeEach(() => {
    audit = { recordInTx: vi.fn().mockResolvedValue(undefined) };
    alerts = { dispatch: vi.fn() };
    service = new BreakGlassService(
      audit as unknown as AuditService,
      alerts as unknown as OperationalAlertService,
    );
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
    expect(audit.recordInTx).not.toHaveBeenCalled();
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
    expect(audit.recordInTx).toHaveBeenCalledTimes(1);
    // Same transaction the operation ran in (B20).
    expect(fn).toHaveBeenCalledWith({ fakeTx: true });
    expect(audit.recordInTx).toHaveBeenCalledWith(
      { fakeTx: true },
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
    const call = audit.recordInTx.mock.calls[0]![1] as { action: string };
    expect(call.action).toMatch(/^BREAK_GLASS_/);
    // B20: operators are alerted on every use.
    expect(alerts.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ alertKey: call.action, transition: 'EVENT' }),
    );
  });

  it('B20: an audit write failure fails the whole action (no unaudited break-glass)', async () => {
    audit.recordInTx.mockRejectedValue(new Error('audit store down'));
    await expect(
      service.execute(
        softwareAdmin,
        { schoolId: 'school-a', permissionId: 'examAdmin.invalidateAttempt', reason: 'x' },
        vi.fn().mockResolvedValue('done'),
      ),
    ).rejects.toThrow('audit store down');
    expect(alerts.dispatch).not.toHaveBeenCalled();
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
    expect(audit.recordInTx).not.toHaveBeenCalled();
  });
});
