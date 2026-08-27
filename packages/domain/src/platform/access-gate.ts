/**
 * The ADR-0016/ADR-0015 access gate — the single source every guard must
 * consult (ADR-0016: "One shared resolution function computes effective
 * access, and every guard calls it. No guard reads either field directly.").
 * Pure and framework-agnostic on purpose: both `apps/api` (request guards)
 * and `apps/worker` (the subscription-expiry sweeper, which has no Nest DI)
 * import this same module rather than each re-implementing the precedence
 * rule — see B3's roadmap Implementation notes for the two-caller rationale.
 *
 * This module answers two related but distinct questions:
 *
 *   1. `resolveSchoolStatus` — the *persisted, cached label* (`07 §4.1`'s
 *      School state model; `05 §3.1`'s list/filter UI). Recomputed and
 *      written to `School.status` on every subscription/activation/platform-
 *      action mutation.
 *   2. `resolveAccessGate` — the *live capability* a write guard actually
 *      enforces. These are not the same thing: ADR-0015 grants 14 days of
 *      full access *after* `School.status` has already flipped to `EXPIRED`
 *      ("expiry never lands mid-examination-week by surprise"), so the
 *      capability check is time-dependent and deliberately never persisted
 *      — a school sitting untouched for 15 days must still re-evaluate to
 *      RESTRICTED without any write happening to trigger a recompute.
 */

export const SCHOOL_STATUSES = [
  'PROVISIONAL',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'DEACTIVATED',
] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'SUSPENDED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The two platform-action overrides Software Admin can set directly
 * (ADR-0016: "independently settable... since those are platform actions
 * unrelated to billing and must override an otherwise-valid subscription").
 * `null` means no override — the derived, subscription-based status governs.
 */
export type PlatformOverride = 'SUSPENDED' | 'DEACTIVATED' | null;

/**
 * `FULL` — ordinary operation. `RESTRICTED` — ADR-0015's EXPIRED capability
 * profile (existing attempts/marking/reads/renewal permitted; new sessions,
 * attempts, exam/question authoring, and imports blocked). `NONE` — no
 * access at all (not yet activated, suspended, or deactivated).
 */
export type AccessCapability = 'FULL' | 'RESTRICTED' | 'NONE';

/** ADR-0015's grace window: full access continues for this many days after
 * `Subscription.expiresAt` before the RESTRICTED profile takes effect. */
export const SUBSCRIPTION_EXPIRY_GRACE_DAYS = 14;

/** Pre-expiry warning thresholds (`05 §4.2`, "escalating warnings"). No
 * concrete day-counts are specified anywhere in the corpus — this is an
 * engineering default, not a product decision, and is easy to make
 * env-configurable later if a real commercial policy narrows it. */
export const SUBSCRIPTION_WARNING_THRESHOLD_DAYS = [30, 14, 7, 1] as const;

/** The threshold, before `expiresAt`, at which `Subscription.status`
 * transitions `ACTIVE → EXPIRING` (`07 §4.2`'s state model). Reuses the same
 * value as the post-expiry grace window by coincidence, not by requirement
 * — kept as a separate named constant so the two can diverge later without
 * a silent behavioural change. */
export const SUBSCRIPTION_EXPIRING_WINDOW_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The persisted `School.status` label. `platformOverride` always wins
 * (ADR-0016 precedence: `DEACTIVATED > SUSPENDED > subscription-derived`).
 * Otherwise derived from `Subscription.status` alone — `SUSPENDED`/
 * `CANCELLED` are defended against for forward-compatibility even though no
 * B3 endpoint currently produces them (see B3's Candidate/Deferred notes);
 * both collapse to the same restricted `EXPIRED` label as a lapsed
 * subscription, since `School.status` has no distinct slot for either.
 */
export function resolveSchoolStatus(
  subscriptionStatus: SubscriptionStatus,
  platformOverride: PlatformOverride,
): SchoolStatus {
  if (platformOverride) return platformOverride;

  switch (subscriptionStatus) {
    case 'PENDING':
      return 'PROVISIONAL';
    case 'ACTIVE':
    case 'EXPIRING':
      return 'ACTIVE';
    case 'EXPIRED':
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'EXPIRED';
  }
}

export interface AccessGateInput {
  subscriptionStatus: SubscriptionStatus;
  /** `Subscription.expiresAt` — required even when status isn't yet EXPIRED,
   * since callers pass the raw row through unconditionally. */
  subscriptionExpiresAt: Date;
  platformOverride: PlatformOverride;
  now: Date;
}

export interface AccessGateResult {
  status: SchoolStatus;
  capability: AccessCapability;
}

/**
 * The one function ADR-0016 requires every write guard to call. Never reads
 * `School.status`/`Subscription.status` as ambient truth on its own — always
 * takes the current row values as explicit input, so callers can't
 * accidentally consult a stale cached column instead.
 */
export function resolveAccessGate(input: AccessGateInput): AccessGateResult {
  const status = resolveSchoolStatus(input.subscriptionStatus, input.platformOverride);

  if (input.platformOverride) return { status, capability: 'NONE' };
  if (status === 'PROVISIONAL') return { status, capability: 'NONE' };
  if (status === 'ACTIVE') return { status, capability: 'FULL' };

  // status === 'EXPIRED' (from Subscription EXPIRED/SUSPENDED/CANCELLED).
  const graceEndsAt = new Date(
    input.subscriptionExpiresAt.getTime() + SUBSCRIPTION_EXPIRY_GRACE_DAYS * MS_PER_DAY,
  );
  return { status, capability: input.now < graceEndsAt ? 'FULL' : 'RESTRICTED' };
}

/** Minimum-capability check helper — `AccessGateService.requireCapability`
 * (apps/api) and any future guard compare against this ordering rather than
 * hand-rolling their own. `NONE < RESTRICTED < FULL`. */
const CAPABILITY_RANK: Record<AccessCapability, number> = { NONE: 0, RESTRICTED: 1, FULL: 2 };

export function meetsCapability(actual: AccessCapability, minimum: AccessCapability): boolean {
  return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[minimum];
}
