import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { SchoolStatus, SubscriptionStatus } from '@atlas/domain';

/**
 * Doctrine §7 ("Badges"): one consistent badge component, colour mapped to
 * semantic meaning — never invented per-screen. These are the label/colour
 * mappings for the three status enums this workspace displays
 * (`SchoolStatus`, `SubscriptionStatus`, `ActivationGrant.status`).
 */

const SCHOOL_STATUS_META: Record<SchoolStatus, { label: string; status: BadgeProps['status'] }> = {
  PROVISIONAL: { label: 'Provisional', status: 'info' },
  ACTIVE: { label: 'Active', status: 'success' },
  SUSPENDED: { label: 'Suspended', status: 'warning' },
  EXPIRED: { label: 'Expired', status: 'danger' },
  DEACTIVATED: { label: 'Deactivated', status: 'neutral' },
};

export function SchoolStatusBadge({ value }: { value: SchoolStatus }) {
  const meta = SCHOOL_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  PENDING: { label: 'Pending', status: 'info' },
  ACTIVE: { label: 'Active', status: 'success' },
  EXPIRING: { label: 'Expiring soon', status: 'warning' },
  EXPIRED: { label: 'Expired', status: 'danger' },
  SUSPENDED: { label: 'Suspended', status: 'danger' },
  CANCELLED: { label: 'Cancelled', status: 'neutral' },
};

export function SubscriptionStatusBadge({ value }: { value: SubscriptionStatus }) {
  const meta = SUBSCRIPTION_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}

export type ActivationGrantStatus = 'ISSUED' | 'ACTIVATED' | 'EXPIRED' | 'REVOKED';

const ACTIVATION_GRANT_STATUS_META: Record<
  ActivationGrantStatus,
  { label: string; status: BadgeProps['status'] }
> = {
  ISSUED: { label: 'Issued', status: 'info' },
  ACTIVATED: { label: 'Activated', status: 'success' },
  EXPIRED: { label: 'Expired', status: 'neutral' },
  REVOKED: { label: 'Revoked', status: 'neutral' },
};

export function ActivationGrantStatusBadge({ value }: { value: ActivationGrantStatus }) {
  const meta = ACTIVATION_GRANT_STATUS_META[value];
  return <Badge status={meta.status}>{meta.label}</Badge>;
}
