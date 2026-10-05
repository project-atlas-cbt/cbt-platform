import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHasPermission } from '@/lib/nav';
import {
  useAdjustmentOperation,
  useExamResults,
  useSchoolResultPolicy,
} from '@/lib/results/staff-queries';
import { usePublishResults, useUnpublishResults } from '@/lib/results/staff-mutations';
import { ExamResultsScreen } from './exam-results-screen';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  // HelpLink (ADR-0035) reads the path; outside a workspace it renders nothing.
  usePathname: () => '/',
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/results/staff-queries', () => ({
  useExamResults: vi.fn(),
  useSchoolResultPolicy: vi.fn(),
  useAdjustmentOperation: vi.fn(),
}));
vi.mock('@/lib/results/staff-mutations', () => ({
  usePublishResults: vi.fn(),
  useUnpublishResults: vi.fn(),
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExamResults = vi.mocked(useExamResults);
const mockUseSchoolResultPolicy = vi.mocked(useSchoolResultPolicy);
const mockUseAdjustmentOperation = vi.mocked(useAdjustmentOperation);
const mockUsePublishResults = vi.mocked(usePublishResults);
const mockUseUnpublishResults = vi.mocked(useUnpublishResults);

const SUMMARY = {
  expectedStudentCount: 4,
  absentCount: 1,
  resultCount: 3,
  voidedCount: 1,
  pendingCount: 0,
  averagePercentage: 71,
  highestPercentage: 82,
  lowestPercentage: 60,
  passRate: 66.7,
};

function data(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    summary: SUMMARY,
    classSummaries: [],
    published: false,
    adjustmentInProgress: false,
    ...overrides,
  };
}

// The screen mounts `<ExportDialog>` (a react-query mutation at its top
// level) unconditionally, so every render needs a QueryClientProvider. Uses
// RTL's `wrapper` option (react-query's own documented pattern) so the
// `rerender` calls below keep the provider too.
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('ExamResultsScreen', () => {
  beforeEach(() => {
    params = new URLSearchParams();
    replace.mockReset();
    mockUseHasPermission.mockReturnValue(false);
    mockUseSchoolResultPolicy.mockReturnValue({ data: undefined } as never);
    mockUseAdjustmentOperation.mockReturnValue({ isPending: true } as never);
    mockUsePublishResults.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseUnpublishResults.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseExamResults.mockReturnValue({
      data: data(),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('shows participation-derived expected and absent counts', () => {
    renderWithClient(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(screen.getByText('Students expected')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // `absentCount` and `voidedCount` are both 1 in the fixture, so the
    // shared `1` value renders twice in the summary `dl` (ADR-0025 keeps
    // Voided visible alongside the averages) — assert both explicitly.
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('Voided')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseExamResults.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    renderWithClient(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows a retryable error state', () => {
    mockUseExamResults.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    renderWithClient(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('hides publication controls entirely without publish or unpublish grants', () => {
    renderWithClient(<ExamResultsScreen examId="exam-1" basePath="/teacher/results" />);
    expect(screen.queryByRole('button', { name: /publish results/i })).not.toBeInTheDocument();
  });

  it('offers publication when granted, and blocks it while an adjustment is running', () => {
    mockUseHasPermission.mockReturnValue(true);
    const { rerender } = renderWithClient(
      <ExamResultsScreen examId="exam-1" basePath="/moderator/results" />,
    );
    expect(screen.getByRole('button', { name: /publish results/i })).toBeEnabled();

    mockUseExamResults.mockReturnValue({
      data: data({ adjustmentInProgress: true }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    rerender(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(screen.getByRole('button', { name: /publish results/i })).toBeDisabled();
    expect(screen.getByText(/publication is unavailable until it finishes/i)).toBeInTheDocument();
  });

  it('renders per-class tabs only for a genuinely multi-class exam (ADR-0013)', () => {
    const classSummaries = [
      { ...SUMMARY, classId: 'c1', className: 'SS2A' },
      { ...SUMMARY, classId: 'c2', className: 'SS2B' },
    ];
    const { rerender } = renderWithClient(
      <ExamResultsScreen examId="exam-1" basePath="/moderator/results" />,
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    mockUseExamResults.mockReturnValue({
      data: data({ classSummaries }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    rerender(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(screen.getByRole('tab', { name: 'SS2B' })).toBeInTheDocument();
  });

  it('reads filter and sort state from the URL rather than local state', () => {
    params = new URLSearchParams('q=ada&state=VOIDED&sortBy=percentage&sortDir=desc&page=2');
    renderWithClient(<ExamResultsScreen examId="exam-1" basePath="/moderator/results" />);
    expect(mockUseExamResults).toHaveBeenCalledWith(
      'exam-1',
      expect.objectContaining({
        q: 'ada',
        state: 'VOIDED',
        sortBy: 'percentage',
        sortDir: 'desc',
        page: 2,
      }),
    );
  });
});
