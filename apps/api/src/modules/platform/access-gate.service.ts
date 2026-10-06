import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import {
  resolveAccessGate,
  meetsCapability,
  type AccessCapability,
  type AccessGateResult,
  type SubscriptionStatus,
  type PlatformOverride,
} from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * The Nest wrapper around @atlas/domain's pure resolveAccessGate — "the one
 * shared function every guard calls" (ADR-0016). `recompute` is called
 * after every subscription/activation/platform-action mutation (never left
 * to drift, per the ADR's own "Harder" consequence); `requireCapability` is
 * the check a future write guard (B11+) calls before allowing a
 * capability-gated action.
 */
@Injectable()
export class AccessGateService {
  /** Cheap, read-only check for the hot path (AuthGuard, every
   * authenticated request) — a plain School.platformOverride select, no
   * subscription read and no write, unlike `recompute`. Roadmap DoD item 4:
   * "Suspension blocks school access immediately." */
  async getPlatformOverride(schoolId: string): Promise<PlatformOverride> {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { platformOverride: true },
    });
    return school?.platformOverride ?? null;
  }

  /** Reads the school's current subscription (its single non-terminal row,
   * or — absent one — its most recent historical row) + platform override,
   * recomputes via the shared pure function, and persists School.status if
   * it changed. Returns the full live result (status + capability). */
  async recompute(schoolId: string): Promise<AccessGateResult> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { status: true, platformOverride: true },
    });

    const subscription = await withTenant(prisma, schoolId, (tx) =>
      tx.subscription.findFirst({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
      }),
    );

    const result = this.evaluate({
      subscriptionStatus: subscription?.status ?? 'PENDING',
      subscriptionExpiresAt: subscription?.expiresAt ?? new Date(0),
      platformOverride: school.platformOverride,
    });

    if (result.status !== school.status) {
      await prisma.school.update({ where: { id: schoolId }, data: { status: result.status } });
    }
    return result;
  }

  /** Pure evaluation without a DB round-trip — used by callers (e.g. the
   * worker sweeper) that already have the subscription/override values in
   * hand and want the capability without a redundant read. */
  evaluate(input: {
    subscriptionStatus: SubscriptionStatus;
    subscriptionExpiresAt: Date;
    platformOverride: PlatformOverride;
  }): AccessGateResult {
    return resolveAccessGate({ ...input, now: new Date() });
  }

  /**
   * P1-3 / ADR-0015's `EXPIRED` profile: refuses new exams, questions,
   * imports, sessions and attempts once the subscription has expired and
   * its grace period has ended. Read-only — no status write on this path,
   * which every one of those requests takes. A school with no subscription
   * row at all (one seeded directly, like the demo schools) is not gated
   * here: it never expired. Platform suspend/deactivate is AuthGuard's.
   */
  async requireActiveSubscription(schoolId: string): Promise<void> {
    if (await this.isSubscriptionRestricted(schoolId)) throw subscriptionExpired();
  }

  /** The check behind `requireActiveSubscription`, for a caller that must
   * still allow part of its work (resuming a running attempt) when it is
   * true. */
  async isSubscriptionRestricted(schoolId: string): Promise<boolean> {
    const [school, subscription] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { platformOverride: true } }),
      withTenant(prisma, schoolId, (tx) =>
        tx.subscription.findFirst({
          where: { schoolId },
          orderBy: { createdAt: 'desc' },
          select: { status: true, expiresAt: true },
        }),
      ),
    ]);
    if (!school || !subscription) return false;
    const result = this.evaluate({
      subscriptionStatus: subscription.status,
      subscriptionExpiresAt: subscription.expiresAt,
      platformOverride: school.platformOverride,
    });
    return result.status === 'EXPIRED' && !meetsCapability(result.capability, 'FULL');
  }

  /** Recomputes live and throws FORBIDDEN if the school's current
   * capability doesn't meet `minimum`. The "one shared function every write
   * guard calls" (ADR-0016) — no B3 route currently calls this (redemption
   * and subscription issuance are what *establish* access, not actions that
   * need to be gated by it); it exists as the ready extension point B13/B14
   * wire real exam-write endpoints into, proven here via B3's own tests. */
  async requireCapability(schoolId: string, minimum: AccessCapability): Promise<AccessGateResult> {
    const result = await this.recompute(schoolId);
    if (!meetsCapability(result.capability, minimum)) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'This school does not currently have access to perform this action.',
      });
    }
    return result;
  }
}

export function subscriptionExpired(): AppHttpException {
  return new AppHttpException({
    code: 'SUBSCRIPTION_EXPIRED',
    message:
      "Your school's subscription has expired. Renew it to create exams, questions, " +
      'imports or new sittings. Existing results and records stay available.',
  });
}
