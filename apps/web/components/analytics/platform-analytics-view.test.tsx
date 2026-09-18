import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePlatformAnalytics } from '@/lib/analytics';
import { PlatformAnalyticsView } from './platform-analytics-view';

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    usePlatformAnalytics: vi.fn(),
  };
});

describe('PlatformAnalyticsView', () => {
  it('renders live commercial health metrics and subscription breakdowns', () => {
    vi.mocked(usePlatformAnalytics).mockReturnValue({
      data: {
        totalSchools: 12,
        activeSchools: 10,
        provisioningSchools: 1,
        suspendedSchools: 1,
        students: 3450,
        attempts: 14200,
        subscriptionsByStatus: {
          ACTIVE: 9,
          TRIAL: 2,
          PAST_DUE: 1,
        },
        subscriptionsByTier: {
          STANDARD: 6,
          ENTERPRISE: 4,
          PILOT: 2,
        },
        trends: [
          { month: '2025-01', schoolsCreated: 2, examsCreated: 15, attemptsStarted: 1200 },
          { month: '2025-02', schoolsCreated: 3, examsCreated: 30, attemptsStarted: 3500 },
        ],
        computedAt: '2026-09-18T00:00:00.000Z',
      },
      isPending: false,
    } as never);

    render(<PlatformAnalyticsView />);

    expect(screen.getByText('Platform Analytics')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // Total schools
    expect(screen.getByText('3,450')).toBeInTheDocument(); // Platform students
    expect(screen.getByText('14,200')).toBeInTheDocument(); // Total attempts
    expect(screen.getByText('Tenant Lifecycle Status')).toBeInTheDocument();
    expect(screen.getByText('Subscription Health')).toBeInTheDocument();
    expect(screen.getByText('Monthly Platform Trends')).toBeInTheDocument();
  });
});
