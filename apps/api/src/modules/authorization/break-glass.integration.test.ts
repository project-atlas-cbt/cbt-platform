/**
 * ADR-0012 break-glass, against a real database: "emits an elevated audit
 * event... visible to the target school." No controller route exists yet
 * to drive this over HTTP (no school-academic-write endpoint a Software
 * Admin could reach exists before B3+ — see this module's own doc
 * comments), so this proves the primitive directly, against a synthetic
 * protected operation, exactly as the 2026-08-26 decision anticipated.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { AuditService } from '../operations/audit-event.service.js';
import { BreakGlassService } from './break-glass.service.js';
import type { AuthorizedActor } from './authorization.types.js';

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.auditEvent.deleteMany({ where: { schoolId } }));
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

describe('BreakGlassService — real database (ADR-0012 DoD item 9)', () => {
  it('writes a real, school-visible AuditEvent row for a cross-tenant break-glass write', async () => {
    const school = await prisma.school.create({
      data: {
        name: `Break-glass Test School ${randomUUID()}`,
        subdomain: `bg-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(school.id);
    const platformUser = await prisma.user.create({
      data: { firstName: 'Platform', lastName: 'Operator', displayName: 'Platform Operator' },
    });
    createdUserIds.push(platformUser.id);

    const actor: AuthorizedActor = {
      kind: 'PLATFORM',
      userId: platformUser.id,
      roles: ['SOFTWARE_ADMIN'],
    };
    const service = new BreakGlassService(new AuditService());

    const operationRan = { value: false };
    const result = await service.execute(
      actor,
      {
        schoolId: school.id,
        permissionId: 'examAdmin.invalidateAttempt',
        reason: 'Regression test — simulated support intervention.',
        entityType: 'ExamAttempt',
        entityId: randomUUID(),
      },
      () => {
        operationRan.value = true;
        return Promise.resolve('operation-result');
      },
    );

    expect(operationRan.value).toBe(true);
    expect(result).toBe('operation-result');

    const events = await withTenant(prisma, school.id, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId: school.id } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schoolId: school.id,
      actorUserId: platformUser.id,
      actorRole: 'SOFTWARE_ADMIN',
      breakGlass: true,
      reason: 'Regression test — simulated support intervention.',
      entityType: 'ExamAttempt',
    });
    expect(events[0]?.action).toMatch(/^BREAK_GLASS_EXAMADMIN_INVALIDATEATTEMPT$/);
  });

  it('an unauthenticated read of the resulting event across tenants is still blocked by RLS (defence in depth)', async () => {
    const schoolA = await prisma.school.create({
      data: {
        name: `Break-glass RLS A ${randomUUID()}`,
        subdomain: `bg-rls-a-${randomUUID().slice(0, 8)}`,
      },
    });
    const schoolB = await prisma.school.create({
      data: {
        name: `Break-glass RLS B ${randomUUID()}`,
        subdomain: `bg-rls-b-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(schoolA.id, schoolB.id);
    const platformUser = await prisma.user.create({
      data: { firstName: 'Platform', lastName: 'Operator', displayName: 'Platform Operator 2' },
    });
    createdUserIds.push(platformUser.id);

    const actor: AuthorizedActor = {
      kind: 'PLATFORM',
      userId: platformUser.id,
      roles: ['SOFTWARE_ADMIN'],
    };
    const service = new BreakGlassService(new AuditService());
    await service.execute(
      actor,
      { schoolId: schoolB.id, permissionId: 'account.deactivate', reason: 'Regression test.' },
      () => Promise.resolve(undefined),
    );

    const visibleFromSchoolA = await withTenant(prisma, schoolA.id, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId: schoolB.id } }),
    );
    expect(visibleFromSchoolA).toHaveLength(0);
  });
});
