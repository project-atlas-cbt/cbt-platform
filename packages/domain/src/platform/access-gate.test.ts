/**
 * B3 Testing requirements: "Unit | State machines for school and
 * subscription; access-gate precedence resolution." Table-driven, mirroring
 * permission-table.test.ts's structural-integrity style — every
 * SubscriptionStatus x PlatformOverride combination is asserted explicitly,
 * plus the ADR-0015 grace-window boundary.
 */
import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_EXPIRY_GRACE_DAYS,
  resolveSchoolStatus,
  resolveAccessGate,
  meetsCapability,
  type PlatformOverride,
  type SchoolStatus,
  type SubscriptionStatus,
} from './access-gate.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('resolveSchoolStatus', () => {
  it('a platform override always wins, regardless of subscription status', () => {
    for (const subscriptionStatus of SUBSCRIPTION_STATUSES) {
      expect(resolveSchoolStatus(subscriptionStatus, 'SUSPENDED')).toBe('SUSPENDED');
      expect(resolveSchoolStatus(subscriptionStatus, 'DEACTIVATED')).toBe('DEACTIVATED');
    }
  });

  const derivation: Record<SubscriptionStatus, SchoolStatus> = {
    PENDING: 'PROVISIONAL',
    ACTIVE: 'ACTIVE',
    EXPIRING: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    SUSPENDED: 'EXPIRED',
    CANCELLED: 'EXPIRED',
  };

  for (const [subscriptionStatus, expected] of Object.entries(derivation)) {
    it(`with no override, ${subscriptionStatus} subscription derives ${expected}`, () => {
      expect(resolveSchoolStatus(subscriptionStatus as SubscriptionStatus, null)).toBe(expected);
    });
  }

  it('derivation table covers every SubscriptionStatus exactly once', () => {
    expect(Object.keys(derivation).sort()).toEqual([...SUBSCRIPTION_STATUSES].sort());
  });
});

describe('resolveAccessGate', () => {
  const now = new Date('2026-08-26T00:00:00Z');

  it.each<[PlatformOverride]>([['SUSPENDED'], ['DEACTIVATED']])(
    'a %s platform override yields NONE capability regardless of subscription state',
    (override) => {
      for (const subscriptionStatus of SUBSCRIPTION_STATUSES) {
        const result = resolveAccessGate({
          subscriptionStatus,
          subscriptionExpiresAt: now,
          platformOverride: override,
          now,
        });
        expect(result.capability).toBe('NONE');
        expect(result.status).toBe(override);
      }
    },
  );

  it('PENDING (PROVISIONAL) yields NONE — not yet activated', () => {
    const result = resolveAccessGate({
      subscriptionStatus: 'PENDING',
      subscriptionExpiresAt: now,
      platformOverride: null,
      now,
    });
    expect(result).toEqual({ status: 'PROVISIONAL', capability: 'NONE' });
  });

  it.each<[SubscriptionStatus]>([['ACTIVE'], ['EXPIRING']])(
    '%s subscription yields FULL capability',
    (subscriptionStatus) => {
      const result = resolveAccessGate({
        subscriptionStatus,
        subscriptionExpiresAt: new Date(now.getTime() + DAY_MS),
        platformOverride: null,
        now,
      });
      expect(result).toEqual({ status: 'ACTIVE', capability: 'FULL' });
    },
  );

  it('within the grace window (ADR-0015): EXPIRED status, FULL capability', () => {
    const expiresAt = new Date(now.getTime() - (SUBSCRIPTION_EXPIRY_GRACE_DAYS - 1) * DAY_MS);
    const result = resolveAccessGate({
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: expiresAt,
      platformOverride: null,
      now,
    });
    expect(result).toEqual({ status: 'EXPIRED', capability: 'FULL' });
  });

  it('exactly at the grace boundary: RESTRICTED (strict "now < graceEnd", boundary excluded)', () => {
    const expiresAt = new Date(now.getTime() - SUBSCRIPTION_EXPIRY_GRACE_DAYS * DAY_MS);
    // graceEndsAt = expiresAt + GRACE_DAYS === now exactly.
    const result = resolveAccessGate({
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: expiresAt,
      platformOverride: null,
      now,
    });
    expect(result.capability).toBe('RESTRICTED');
  });

  it('past the grace window: EXPIRED status, RESTRICTED capability', () => {
    const expiresAt = new Date(now.getTime() - (SUBSCRIPTION_EXPIRY_GRACE_DAYS + 1) * DAY_MS);
    const result = resolveAccessGate({
      subscriptionStatus: 'EXPIRED',
      subscriptionExpiresAt: expiresAt,
      platformOverride: null,
      now,
    });
    expect(result).toEqual({ status: 'EXPIRED', capability: 'RESTRICTED' });
  });

  it.each<[SubscriptionStatus]>([['SUSPENDED'], ['CANCELLED']])(
    'subscription-level %s (unreachable via any B3 endpoint, defended defensively) behaves like EXPIRED',
    (subscriptionStatus) => {
      const expiresAt = new Date(now.getTime() - (SUBSCRIPTION_EXPIRY_GRACE_DAYS + 1) * DAY_MS);
      const result = resolveAccessGate({
        subscriptionStatus,
        subscriptionExpiresAt: expiresAt,
        platformOverride: null,
        now,
      });
      expect(result).toEqual({ status: 'EXPIRED', capability: 'RESTRICTED' });
    },
  );
});

describe('meetsCapability', () => {
  it('orders NONE < RESTRICTED < FULL', () => {
    expect(meetsCapability('FULL', 'FULL')).toBe(true);
    expect(meetsCapability('FULL', 'RESTRICTED')).toBe(true);
    expect(meetsCapability('FULL', 'NONE')).toBe(true);
    expect(meetsCapability('RESTRICTED', 'FULL')).toBe(false);
    expect(meetsCapability('RESTRICTED', 'RESTRICTED')).toBe(true);
    expect(meetsCapability('NONE', 'RESTRICTED')).toBe(false);
    expect(meetsCapability('NONE', 'NONE')).toBe(true);
  });
});
