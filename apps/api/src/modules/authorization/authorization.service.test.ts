/**
 * B2 Testing requirements: "Unit | Every scope predicate; the effective-
 * access function against a truth table derived from 02" and "Integration
 * | Each role against each protected resource type, permitted and
 * denied." Exercised here against fixture actors — see CLAUDE.md's
 * 2026-08-26 decision: no real Software Admin login exists yet, so
 * break-glass and this function are proven via constructed actors, not a
 * real HTTP session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@atlas/domain';
import { AuthorizationService } from './authorization.service.js';
import { ScopeResolverRegistry } from './scope-resolvers.js';
import type { AuthorizedActor } from './authorization.types.js';

function actor(
  kind: 'SCHOOL' | 'PLATFORM',
  roles: Role[],
  overrides: Partial<AuthorizedActor> = {},
): AuthorizedActor {
  if (kind === 'PLATFORM') {
    return { kind: 'PLATFORM', userId: 'platform-user', roles, ...overrides } as AuthorizedActor;
  }
  return {
    kind: 'SCHOOL',
    userId: 'user-1',
    schoolId: 'school-a',
    membershipId: 'membership-1',
    roles,
    ...overrides,
  };
}

describe('AuthorizationService.evaluate', () => {
  let service: AuthorizationService;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    service = new AuthorizationService(new ScopeResolverRegistry());
  });

  it('ALLOWED: a HOD may approve a question, once a DEPARTMENT resolver exists (DEPARTMENT is fail-closed until B5)', async () => {
    const registry = new ScopeResolverRegistry();
    registry.register('DEPARTMENT', () => true);
    service = new AuthorizationService(registry);
    const decision = await service.evaluate(actor('SCHOOL', ['HOD']), 'questionBank.approve');
    expect(decision).toMatchObject({
      allowed: true,
      outcome: 'ALLOWED',
      matchedRole: 'HOD',
      matchedScope: 'DEPARTMENT',
    });
  });

  it('FORBIDDEN (fail-closed): a HOD cannot approve a question before B5 registers a real DEPARTMENT resolver', async () => {
    const decision = await service.evaluate(actor('SCHOOL', ['HOD']), 'questionBank.approve');
    expect(decision).toMatchObject({ allowed: false, outcome: 'FORBIDDEN' });
  });

  it('FORBIDDEN: a Moderator may not approve a question (02 rule 3 / DoD item 7), even with DEPARTMENT registered', async () => {
    const registry = new ScopeResolverRegistry();
    registry.register('DEPARTMENT', () => true);
    service = new AuthorizationService(registry);
    const decision = await service.evaluate(actor('SCHOOL', ['MODERATOR']), 'questionBank.approve');
    expect(decision).toMatchObject({
      allowed: false,
      outcome: 'FORBIDDEN',
      requiresBreakGlass: false,
    });
  });

  it('FORBIDDEN: a Teacher cannot reach a class/subject they are not assigned to (02 rule 1 / DoD item 5)', async () => {
    // ASSIGNED is unregistered (fail-closed) until B6 — so even a Teacher
    // holding the right role is denied absent a real assignment resolver.
    const decision = await service.evaluate(actor('SCHOOL', ['TEACHER']), 'questionBank.view');
    expect(decision).toMatchObject({ allowed: false, outcome: 'FORBIDDEN' });
  });

  it('ALLOWED once B6 registers a real ASSIGNED resolver', async () => {
    const registry = new ScopeResolverRegistry();
    registry.register('ASSIGNED', () => true);
    service = new AuthorizationService(registry);
    const decision = await service.evaluate(actor('SCHOOL', ['TEACHER']), 'questionBank.view');
    expect(decision).toMatchObject({ allowed: true, matchedScope: 'ASSIGNED' });
  });

  it('DENIED (FORBIDDEN): a Student cannot reach the question bank (02 rule 9 / DoD item 8)', async () => {
    const decision = await service.evaluate(actor('SCHOOL', ['STUDENT']), 'questionBank.view');
    expect(decision).toMatchObject({ allowed: false, outcome: 'FORBIDDEN' });
  });

  it('ALLOWED: a Student reaches their own resource (SELF scope)', async () => {
    const a = actor('SCHOOL', ['STUDENT']) as Extract<AuthorizedActor, { kind: 'SCHOOL' }>;
    const decision = await service.evaluate(a, 'studentCbt.viewActiveAssessment', {
      ownerUserId: a.userId,
    });
    expect(decision).toMatchObject({ allowed: true, matchedScope: 'SELF' });
  });

  it('NOT_FOUND: cross-tenant resource is rejected before any grant is even consulted (DoD item 11)', async () => {
    const a = actor('SCHOOL', ['SCHOOL_ADMIN']);
    const decision = await service.evaluate(a, 'exam.editDraft', { schoolId: 'school-b' });
    expect(decision).toMatchObject({ allowed: false, outcome: 'NOT_FOUND' });
  });

  it('FORBIDDEN with requiresBreakGlass=true: Software Admin on a break-glass-only row is never silently allowed', async () => {
    const decision = await service.evaluate(
      actor('PLATFORM', ['SOFTWARE_ADMIN']),
      'examAdmin.invalidateAttempt',
    );
    expect(decision).toMatchObject({
      allowed: false,
      outcome: 'FORBIDDEN',
      requiresBreakGlass: true,
    });
  });

  it('DENIED outright: Software Admin cannot approve a question, break-glass or otherwise (ADR-0012 content authoring)', async () => {
    const decision = await service.evaluate(
      actor('PLATFORM', ['SOFTWARE_ADMIN']),
      'questionBank.approve',
    );
    expect(decision).toMatchObject({
      allowed: false,
      outcome: 'FORBIDDEN',
      requiresBreakGlass: false,
    });
  });

  it('ALLOWED: Software Admin reads across schools without break-glass (ADR-0012 "reads: permitted, audited")', async () => {
    const decision = await service.evaluate(
      actor('PLATFORM', ['SOFTWARE_ADMIN']),
      'questionBank.view',
    );
    expect(decision).toMatchObject({ allowed: true, outcome: 'ALLOWED', matchedScope: 'PLATFORM' });
  });

  it('a membership holding two roles (e.g. TEACHER + HOD) gets the union of both — DoD-relevant multi-role case', async () => {
    const dualRole = actor('SCHOOL', ['TEACHER', 'HOD']);
    const registry = new ScopeResolverRegistry();
    registry.register('ASSIGNED', () => true);
    registry.register('DEPARTMENT', () => true);
    const serviceWithResolvers = new AuthorizationService(registry);

    const hodOnlyDecision = await serviceWithResolvers.evaluate(dualRole, 'questionBank.approve'); // HOD-only capability
    const teacherOnlyDecision = await serviceWithResolvers.evaluate(
      dualRole,
      'questionBank.create',
    ); // TEACHER-only

    expect(hodOnlyDecision.allowed).toBe(true);
    expect(teacherOnlyDecision.allowed).toBe(true);
  });

  it('throws for an unknown permission id rather than silently denying (fail loud on a programming error)', async () => {
    await expect(service.evaluate(actor('SCHOOL', ['TEACHER']), 'no.such.rule')).rejects.toThrow(
      /Unknown permission rule/,
    );
  });
});

describe('AuthorizationService.effectivePermissions (GET /v1/me/permissions)', () => {
  let service: AuthorizationService;

  beforeEach(() => {
    service = new AuthorizationService(new ScopeResolverRegistry());
  });

  it('excludes SYSTEM-kind rows (not human-invokable) even though a role technically "has" them', () => {
    const permissions = service.effectivePermissions(actor('SCHOOL', ['TEACHER']));
    expect(permissions.find((p) => p.resource === 'studentCbt.autoSubmit')).toBeUndefined();
  });

  it('excludes DENIED/DEFERRED rows', () => {
    const permissions = service.effectivePermissions(actor('SCHOOL', ['STUDENT']));
    expect(permissions.find((p) => p.resource === 'questionBank.view')).toBeUndefined();
  });

  it('includes a GRANTED row with its scope, and does not require a resource to be evaluated', () => {
    const permissions = service.effectivePermissions(actor('SCHOOL', ['HOD']));
    expect(permissions).toContainEqual(
      expect.objectContaining({ resource: 'questionBank.approve', scope: 'DEPARTMENT' }),
    );
  });

  it('marks a break-glass-only capability distinctly, never as an ordinary grant', () => {
    const permissions = service.effectivePermissions(actor('PLATFORM', ['SOFTWARE_ADMIN']));
    const entry = permissions.find((p) => p.resource === 'examAdmin.invalidateAttempt');
    expect(entry).toMatchObject({ breakGlass: true });
    expect(entry?.scope).toBeUndefined();
  });
});
