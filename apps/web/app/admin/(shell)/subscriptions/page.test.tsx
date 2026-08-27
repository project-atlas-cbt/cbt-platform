import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubscriptionsPage from './page';
import { useSchools } from '@/lib/platform/queries';

vi.mock('@/lib/platform/queries', () => ({ useSchools: vi.fn() }));
const mockUseSchools = vi.mocked(useSchools);

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    mockUseSchools.mockReset();
  });

  it('defaults to schools whose subscription needs attention (provisional/expired/suspended)', () => {
    mockUseSchools.mockReturnValue({
      isPending: false,
      isError: false,
      data: { schools: [] },
      refetch: vi.fn(),
    } as never);
    render(<SubscriptionsPage />);
    expect(mockUseSchools).toHaveBeenCalledWith({
      status: ['SUSPENDED', 'EXPIRED', 'PROVISIONAL'],
      pageSize: 100,
    });
  });

  it('shows the real subscription plan/status/expiry per row, and a Manage link to the subscription tab', () => {
    mockUseSchools.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        schools: [
          {
            id: 's1',
            name: 'Lapsed School',
            subdomain: 'lapsed',
            status: 'EXPIRED',
            subscriptionStatus: 'EXPIRED',
            subscriptionExpiresAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      refetch: vi.fn(),
    } as never);
    render(<SubscriptionsPage />);
    expect(screen.getByText('Lapsed School')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      '/admin/schools/s1/subscription',
    );
  });

  it('shows an honest empty state when nothing needs attention', () => {
    mockUseSchools.mockReturnValue({
      isPending: false,
      isError: false,
      data: { schools: [] },
      refetch: vi.fn(),
    } as never);
    render(<SubscriptionsPage />);
    expect(screen.getByText('No subscriptions need attention')).toBeInTheDocument();
  });
});
