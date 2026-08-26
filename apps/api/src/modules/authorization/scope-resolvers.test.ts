import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizedActor } from './authorization.types.js';
import { ScopeResolverRegistry } from './scope-resolvers.js';

type SchoolActor = Extract<AuthorizedActor, { kind: 'SCHOOL' }>;

const schoolActor = (overrides: Partial<SchoolActor> = {}): SchoolActor => ({
  kind: 'SCHOOL',
  userId: 'user-1',
  schoolId: 'school-a',
  membershipId: 'membership-1',
  roles: ['TEACHER'],
  ...overrides,
});

const platformActor: AuthorizedActor = {
  kind: 'PLATFORM',
  userId: 'platform-user-1',
  roles: ['SOFTWARE_ADMIN'],
};

describe('ScopeResolverRegistry — built-in resolvers', () => {
  let registry: ScopeResolverRegistry;

  beforeEach(() => {
    registry = new ScopeResolverRegistry();
  });

  it('PLATFORM matches only a platform actor', async () => {
    await expect(registry.resolve('PLATFORM', platformActor, undefined)).resolves.toBe(true);
    await expect(registry.resolve('PLATFORM', schoolActor(), undefined)).resolves.toBe(false);
  });

  it('SCHOOL matches a school actor with no resource, or a same-school resource', async () => {
    await expect(registry.resolve('SCHOOL', schoolActor(), undefined)).resolves.toBe(true);
    await expect(registry.resolve('SCHOOL', schoolActor(), { schoolId: 'school-a' })).resolves.toBe(
      true,
    );
    await expect(registry.resolve('SCHOOL', platformActor, undefined)).resolves.toBe(false);
  });

  it('SCHOOL denies a cross-tenant resource', async () => {
    await expect(registry.resolve('SCHOOL', schoolActor(), { schoolId: 'school-b' })).resolves.toBe(
      false,
    );
  });

  it('SELF matches when ownerUserId is the actor, denies otherwise', async () => {
    const actor = schoolActor();
    await expect(registry.resolve('SELF', actor, { ownerUserId: actor.userId })).resolves.toBe(
      true,
    );
    await expect(registry.resolve('SELF', actor, { ownerUserId: 'someone-else' })).resolves.toBe(
      false,
    );
  });

  it("SELF matches when ownerMembershipId is the actor's own membership", async () => {
    const actor = schoolActor();
    await expect(
      registry.resolve('SELF', actor, { ownerMembershipId: actor.membershipId }),
    ).resolves.toBe(true);
    await expect(
      registry.resolve('SELF', actor, { ownerMembershipId: 'someone-elses-membership' }),
    ).resolves.toBe(false);
  });

  it('SELF matches with no resource context at all (no specific instance to compare)', async () => {
    await expect(registry.resolve('SELF', schoolActor(), undefined)).resolves.toBe(true);
  });

  it('OWNED requires a school actor, denies platform actors', async () => {
    await expect(registry.resolve('OWNED', platformActor, undefined)).resolves.toBe(false);
  });

  it("OWNED matches the actor's own membership as owner, denies another membership", async () => {
    const actor = schoolActor();
    await expect(
      registry.resolve('OWNED', actor, {
        schoolId: actor.schoolId,
        ownerMembershipId: actor.membershipId,
      }),
    ).resolves.toBe(true);
    await expect(
      registry.resolve('OWNED', actor, {
        schoolId: actor.schoolId,
        ownerMembershipId: 'other-membership',
      }),
    ).resolves.toBe(false);
  });

  it('OWNED denies a cross-tenant resource even if ownerMembershipId happens to match', async () => {
    const actor = schoolActor();
    await expect(
      registry.resolve('OWNED', actor, {
        schoolId: 'school-b',
        ownerMembershipId: actor.membershipId,
      }),
    ).resolves.toBe(false);
  });

  it('ASSIGNED and DEPARTMENT fail closed (deny) until a phase registers a real resolver', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(registry.resolve('ASSIGNED', schoolActor(), undefined)).resolves.toBe(false);
    await expect(registry.resolve('DEPARTMENT', schoolActor(), undefined)).resolves.toBe(false);
    warnSpy.mockRestore();
  });

  it('NONE always denies', async () => {
    await expect(registry.resolve('NONE', schoolActor(), undefined)).resolves.toBe(false);
  });

  it('register() lets a later phase override the fail-closed default', async () => {
    registry.register(
      'DEPARTMENT',
      (actor) => actor.kind === 'SCHOOL' && actor.roles.includes('HOD'),
    );
    await expect(
      registry.resolve('DEPARTMENT', schoolActor({ roles: ['HOD'] }), undefined),
    ).resolves.toBe(true);
    await expect(
      registry.resolve('DEPARTMENT', schoolActor({ roles: ['TEACHER'] }), undefined),
    ).resolves.toBe(false);
  });
});
