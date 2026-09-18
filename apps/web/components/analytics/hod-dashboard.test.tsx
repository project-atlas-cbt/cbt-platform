import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  useAcademicsContext,
  useClasses,
  useDepartments,
  useSubjects,
} from '@/lib/academics/queries';
import { useDepartmentAnalytics, useExamsList } from '@/lib/analytics';
import { HodDashboard } from './hod-dashboard';

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useDepartments: vi.fn(),
  useSubjects: vi.fn(),
}));

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useDepartmentAnalytics: vi.fn(),
    useExamsList: vi.fn(),
  };
});

vi.mock('@/components/question-review/review-queue-widget', () => ({
  ReviewQueueWidget: () => <div data-testid="review-queue-widget">Mock Review Queue Widget</div>,
}));

describe('HodDashboard', () => {
  it('renders HOD dashboard with department readiness, subjects, and review queue widget', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: {
        session: { id: 'ses-1', name: '2025/2026 Academic Session' },
        term: { id: 'term-1', name: 'First Term' },
      },
    } as never);

    vi.mocked(useDepartments).mockReturnValue({
      data: {
        departments: [
          { id: 'dept-sci', name: 'Science Department', code: 'SCI', status: 'ACTIVE' },
        ],
      },
      isPending: false,
    } as never);

    vi.mocked(useSubjects).mockReturnValue({
      data: {
        subjects: [
          { id: 'sub-phy', name: 'Physics', code: 'PHY', departmentId: 'dept-sci' },
          { id: 'sub-chm', name: 'Chemistry', code: 'CHM', departmentId: 'dept-sci' },
        ],
      },
      isPending: false,
    } as never);

    vi.mocked(useClasses).mockReturnValue({
      data: { classes: new Array(6) },
      isPending: false,
    } as never);

    vi.mocked(useExamsList).mockReturnValue({
      data: {
        exams: [
          { id: 'ex-1', status: 'OPEN' },
          { id: 'ex-2', status: 'COMPLETED' },
        ],
      },
      isPending: false,
    } as never);

    vi.mocked(useDepartmentAnalytics).mockReturnValue({
      data: {
        averagePercentage: 76.5,
        highestPercentage: 99,
        lowestPercentage: 42,
        passRate: 91,
        resultCount: 180,
      },
      isPending: false,
    } as never);

    render(<HodDashboard />);

    expect(screen.getByText(/Science Department\s+Dashboard/i)).toBeInTheDocument();
    expect(screen.getByTestId('review-queue-widget')).toBeInTheDocument();
    expect(screen.getByText('76.5%')).toBeInTheDocument(); // Average score
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 department subjects
    expect(screen.getByText('6')).toBeInTheDocument(); // 6 department classes
  });
});
