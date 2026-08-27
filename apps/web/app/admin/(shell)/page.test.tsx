import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlatformDashboardPage from './page';
import { usePlatformMetrics, useSchools } from '@/lib/platform/queries';

vi.mock('@/lib/platform/queries', () => ({
  usePlatformMetrics: vi.fn(),
  useSchools: vi.fn(),
}));

const mockUseMetrics = vi.mocked(usePlatformMetrics);
const mockUseSchools = vi.mocked(useSchools);

const METRICS = {
  totalSchools: 3,
  activeSchools: 2,
  provisionalSchools: 0,
  suspendedSchools: 1,
  expiredSchools: 0,
  deactivatedSchools: 0,
  students: 100,
  teachers: 10,
  examsConducted: 0,
  attempts: 0,
  computedAt: '2026-08-27T10:00:00.000Z',
};

function attentionResult(schools: unknown[] = []) {
  return { isPending: false, isError: false, isSuccess: true, data: { schools }, refetch: vi.fn() };
}

describe('PlatformDashboardPage', () => {
  beforeEach(() => {
    mockUseMetrics.mockReset();
    mockUseSchools.mockReset();
    mockUseSchools.mockReturnValue(attentionResult() as never);
  });

  it('shows "No schools have been onboarded yet" when the platform is empty — 05 §2.1', () => {
    mockUseMetrics.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { ...METRICS, totalSchools: 0 },
      refetch: vi.fn(),
    } as never);
    render(<PlatformDashboardPage />);
    expect(screen.getByText('No schools have been onboarded yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create school/i })).toHaveAttribute(
      'href',
      '/admin/schools/new',
    );
  });

  it('renders every metric 04 §6 names, using real values from the DTO', () => {
    mockUseMetrics.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: METRICS,
      refetch: vi.fn(),
    } as never);
    render(<PlatformDashboardPage />);
    expect(screen.getByText('3')).toBeInTheDocument(); // Total schools
    expect(screen.getByText('100')).toBeInTheDocument(); // Students
    expect(screen.getByText('10')).toBeInTheDocument(); // Teachers
  });

  it('shows a "not yet computed" caption rather than a blank/fabricated timestamp when computedAt is null', () => {
    mockUseMetrics.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { ...METRICS, computedAt: null },
      refetch: vi.fn(),
    } as never);
    render(<PlatformDashboardPage />);
    expect(screen.getByText(/not yet computed/i)).toBeInTheDocument();
  });

  it('a metrics failure degrades only the metrics section — DoD item 12', () => {
    mockUseMetrics.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('down'),
      refetch: vi.fn(),
    } as never);
    mockUseSchools.mockReturnValue(
      attentionResult([{ id: 'a1', name: 'At-Risk School', status: 'SUSPENDED' }]) as never,
    );
    render(<PlatformDashboardPage />);
    expect(screen.getByText(/metrics unavailable/i)).toBeInTheDocument();
    // The independent "schools requiring attention" section still renders.
    expect(screen.getByText('At-Risk School')).toBeInTheDocument();
  });
});
