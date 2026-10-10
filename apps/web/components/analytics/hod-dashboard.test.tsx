import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  useAcademicsContext,
  useClasses,
  useMyHodDepartment,
  useSubjects,
} from '@/lib/academics/queries';
import { useDepartmentAnalytics, useExamsList } from '@/lib/analytics';
import { HodDashboard } from './hod-dashboard';

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useMyHodDepartment: vi.fn(),
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

    vi.mocked(useMyHodDepartment).mockReturnValue({
      department: { id: 'dept-sci', name: 'Science Department', code: 'SCI', status: 'ACTIVE' },
      isPending: false,
      isSuccess: true,
      isError: false,
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
      data: {
        classes: [
          // ADR-0038: the server returns only classes offering the
          // department's subjects (`departmentId` query).
          ...Array.from({ length: 6 }, (_, i) => ({ id: `c-${i}`, status: 'ACTIVE' })),
        ],
      },
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
    expect(vi.mocked(useClasses)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ departmentId: 'dept-sci' }),
    );
  });

  function mockLoadedData() {
    vi.mocked(useAcademicsContext).mockReturnValue({ data: undefined } as never);
    vi.mocked(useSubjects).mockReturnValue({ data: { subjects: [] }, isPending: false } as never);
    vi.mocked(useClasses).mockReturnValue({ data: { classes: [] }, isPending: false } as never);
    vi.mocked(useExamsList).mockReturnValue({ data: undefined, isPending: true } as never);
  }

  it('says so when the HOD heads no department, instead of showing empty results (P1-12)', () => {
    mockLoadedData();
    vi.mocked(useMyHodDepartment).mockReturnValue({
      department: undefined,
      isPending: false,
      isSuccess: true,
      isError: false,
    } as never);
    vi.mocked(useDepartmentAnalytics).mockReturnValue({ isPending: true } as never);

    render(<HodDashboard />);

    expect(screen.getByText('You are not assigned to a department')).toBeInTheDocument();
    expect(screen.queryByText('Department Average')).not.toBeInTheDocument();
  });

  it('shows an error, not empty results, when department results are refused (P1-12)', () => {
    mockLoadedData();
    vi.mocked(useMyHodDepartment).mockReturnValue({
      department: { id: 'dept-sci', name: 'Sciences', code: 'SCI', status: 'ACTIVE' },
      isPending: false,
      isSuccess: true,
      isError: false,
    } as never);
    vi.mocked(useDepartmentAnalytics).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('You do not have permission to view this department.'),
      refetch: vi.fn(),
    } as never);

    render(<HodDashboard />);

    expect(screen.getByText("Department results couldn't be loaded")).toBeInTheDocument();
    expect(screen.queryByText('Department Average')).not.toBeInTheDocument();
  });
});
