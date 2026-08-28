import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolSubscriptionSettingsPage from './page';
import { useSubscriptionStatus } from '@/lib/school-settings/queries';

vi.mock('@/lib/school-settings/queries', () => ({ useSubscriptionStatus: vi.fn() }));

const mockUseSubscriptionStatus = vi.mocked(useSubscriptionStatus);

describe('SchoolSubscriptionSettingsPage', () => {
  it('shows a loading skeleton while loading', () => {
    mockUseSubscriptionStatus.mockReturnValue({ isPending: true, isError: false } as never);
    render(<SchoolSubscriptionSettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<SchoolSubscriptionSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders plan/status/expiry for an active subscription, no expired banner', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        plan: 'STANDARD',
        status: 'ACTIVE',
        startAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        inGracePeriod: false,
      },
    } as never);
    render(<SchoolSubscriptionSettingsPage />);
    expect(screen.getByText('STANDARD')).toBeInTheDocument();
    expect(screen.queryByText('Subscription Expired')).not.toBeInTheDocument();
  });

  it('shows the 01 §48 expired message when EXPIRED and out of grace', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        plan: 'STANDARD',
        status: 'EXPIRED',
        startAt: '2025-01-01T00:00:00.000Z',
        expiresAt: '2025-06-01T00:00:00.000Z',
        inGracePeriod: false,
      },
    } as never);
    render(<SchoolSubscriptionSettingsPage />);
    expect(screen.getByText('Subscription Expired')).toBeInTheDocument();
    expect(
      screen.getByText(/contact your software administrator to renew access/i),
    ).toBeInTheDocument();
  });

  it('shows a grace-period notice instead of the expired banner while still within grace', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        plan: 'STANDARD',
        status: 'EXPIRED',
        startAt: '2025-01-01T00:00:00.000Z',
        expiresAt: '2025-06-01T00:00:00.000Z',
        inGracePeriod: true,
      },
    } as never);
    render(<SchoolSubscriptionSettingsPage />);
    expect(screen.queryByText('Subscription Expired')).not.toBeInTheDocument();
    expect(screen.getByText(/remains within its grace period/i)).toBeInTheDocument();
  });
});
