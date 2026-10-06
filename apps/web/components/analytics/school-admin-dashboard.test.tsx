import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  useAcademicsContext,
  useClasses,
  useHods,
  useModerators,
  useStudents,
  useSubjects,
  useTeachers,
} from '@/lib/academics/queries';
import {
  useExamsList,
  useQuestionCounts,
  useSchoolAnalytics,
  useSchoolSubscription,
} from '@/lib/analytics';
import { useGradingScales } from '@/lib/school-settings/queries';
import { SchoolAdminDashboard } from './school-admin-dashboard';

vi.mock('@/lib/school-settings/queries', () => ({ useGradingScales: vi.fn() }));

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useHods: vi.fn(),
  useModerators: vi.fn(),
  useStudents: vi.fn(),
  useSubjects: vi.fn(),
  useTeachers: vi.fn(),
}));

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useSchoolAnalytics: vi.fn(),
    useExamsList: vi.fn(),
    useQuestionCounts: vi.fn(),
    useSchoolSubscription: vi.fn(),
  };
});

describe('SchoolAdminDashboard', () => {
  it('renders operational overview metrics and assessment summaries', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: {
        schoolName: 'King’s College Lagos',
        session: { id: 'ses-1', name: '2025/2026 Academic Session' },
        term: { id: 'term-1', name: 'First Term' },
      },
    } as never);

    vi.mocked(useStudents).mockReturnValue({ data: { total: 420 }, isPending: false } as never);
    vi.mocked(useTeachers).mockReturnValue({ data: { total: 32 }, isPending: false } as never);
    vi.mocked(useHods).mockReturnValue({ data: { total: 6 }, isPending: false } as never);
    vi.mocked(useModerators).mockReturnValue({ data: { total: 4 }, isPending: false } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: { classes: new Array(12) },
      isPending: false,
    } as never);
    vi.mocked(useSubjects).mockReturnValue({
      data: { subjects: new Array(18) },
      isPending: false,
    } as never);

    vi.mocked(useSchoolAnalytics).mockReturnValue({
      data: {
        totalStudents: 420,
        averagePercentage: 73.4,
        highestPercentage: 98,
        lowestPercentage: 35,
        passRate: 88,
        resultCount: 380,
      },
      isPending: false,
    } as never);

    vi.mocked(useExamsList).mockReturnValue({
      data: {
        exams: [
          { id: 'ex-1', status: 'OPEN' },
          { id: 'ex-2', status: 'COMPLETED' },
          { id: 'ex-3', status: 'DRAFT' },
        ],
      },
      isPending: false,
    } as never);

    vi.mocked(useQuestionCounts).mockReturnValue({
      data: { totalQuestions: 1500 },
      isPending: false,
    } as never);
    vi.mocked(useSchoolSubscription).mockReturnValue({
      data: { status: 'ACTIVE', tier: 'ENTERPRISE', maxStudents: 1000 },
      isPending: false,
    } as never);

    vi.mocked(useGradingScales).mockReturnValue({
      data: { items: [{ level: null, currentVersion: { id: 'v1' } }], defaultTemplate: [] },
    } as never);

    render(<SchoolAdminDashboard />);

    expect(screen.queryByText(/no grading scale/i)).not.toBeInTheDocument();
    expect(screen.getByText('King’s College Lagos Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/2025\/2026 Academic Session/i)).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument(); // Students
    expect(screen.getByText('32')).toBeInTheDocument(); // Teachers
    expect(screen.getByText('73.4%')).toBeInTheDocument(); // Average
    expect(screen.getByText('380')).toBeInTheDocument(); // Results count
  });

  // Mocks from the test above stay in place; only the scales change.
  it('warns when no grading scale is set, linking to the Results settings', () => {
    vi.mocked(useGradingScales).mockReturnValue({
      data: { items: [], defaultTemplate: [] },
    } as never);

    render(<SchoolAdminDashboard />);

    expect(screen.getByText('No grading scale has been set')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set grading bands/i })).toHaveAttribute(
      'href',
      '/school/settings/results',
    );
  });

  it('names the levels left ungraded when only some have their own scale', () => {
    vi.mocked(useGradingScales).mockReturnValue({
      data: {
        items: [
          { level: 'JSS1', currentVersion: { id: 'v1' } },
          { level: 'JSS2', currentVersion: { id: 'v2' } },
          { level: 'JSS3', currentVersion: { id: 'v3' } },
        ],
        defaultTemplate: [],
      },
    } as never);

    render(<SchoolAdminDashboard />);

    expect(screen.getByText('No grading scale for SS1, SS2, SS3')).toBeInTheDocument();
  });
});
