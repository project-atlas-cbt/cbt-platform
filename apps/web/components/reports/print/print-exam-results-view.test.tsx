import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiComponents } from '@atlas/contracts';
import { PrintExamResultsView } from './print-exam-results-view';
import { apiClient } from '@/lib/api';
import type { PrintExamResultItem, PrintExamResultsData } from '@/lib/reports/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/tenant', () => ({
  useTenant: () => ({
    school: { name: 'Greenfield College', logoUrl: null },
  }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    me: {
      user: { displayName: 'Teacher Doe' },
      membership: { loginIdentifier: 'T01' },
    },
  }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    GET: vi.fn(),
  },
  toApiError: () => new Error('API Error'),
  // `@/lib/reports/queries` imports `unwrap`/`resolveApiOrigin` from
  // `@/lib/api`; without them `usePrintExamResults`'s queryFn throws before
  // the query resolves (same shim export-progress.test.tsx added in B19).
  unwrap: async (resultPromise: Promise<{ data?: unknown; error?: unknown }>) => {
    const result = await resultPromise;
    if (result.error !== undefined) throw new Error('API Error');
    return result.data;
  },
  resolveApiOrigin: () => 'http://localhost:3001',
}));

const mockGet = vi.mocked(apiClient.GET);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function resultRow(overrides: Partial<PrintExamResultItem>): PrintExamResultItem {
  return {
    id: 'r1',
    attemptId: 'a1',
    studentProfileId: 'sp1',
    studentName: 'Chidi Obi',
    studentIdentifier: 'ST-001',
    classId: 'c1',
    className: 'SS3A',
    state: 'FINAL',
    totalMarks: 50,
    earnedMarks: 42,
    percentage: 84,
    correctCount: 21,
    incorrectCount: 4,
    unansweredCount: 0,
    partialCount: 0,
    grade: 'A',
    withheld: false,
    withheldReason: null,
    voidedReason: null,
    finalizedAt: '2026-10-01T10:00:00.000Z',
    submittedAt: '2026-10-01T09:40:00.000Z',
    attemptState: 'SUBMITTED',
    ...overrides,
  };
}

// The real `GET /v1/reports/exams/:id/results` body (ResultQueryService.listForExam).
// Absent students are not rows: absence lives in participation (ADR-0010).
const results: PrintExamResultsData = {
  items: [
    resultRow({}),
    resultRow({
      id: 'r2',
      attemptId: 'a2',
      studentProfileId: 'sp2',
      studentName: 'Amina Yusuf',
      studentIdentifier: 'ST-002',
      state: 'VOIDED',
      earnedMarks: 0,
      percentage: 0,
      grade: null,
      voidedReason: 'Malpractice',
      attemptState: 'INVALIDATED',
    }),
    resultRow({
      id: 'r3',
      attemptId: 'a3',
      studentProfileId: 'sp3',
      studentName: 'Tunde Bello',
      studentIdentifier: 'ST-003',
      earnedMarks: 30,
      percentage: 60,
      grade: 'C',
      attemptState: 'AUTO_SUBMITTED',
    }),
  ],
  total: 3,
  page: 1,
  pageSize: 500,
  summary: {
    expectedStudentCount: 4,
    absentCount: 1,
    resultCount: 2,
    voidedCount: 1,
    pendingCount: 0,
    averagePercentage: 72,
    highestPercentage: 84,
    lowestPercentage: 60,
    passRate: 100,
  },
  classSummaries: [],
  published: false,
  adjustmentInProgress: false,
};

const exam: ApiComponents['schemas']['ExamResponseDto'] = {
  id: 'exam-1',
  title: 'Biology Mock Examination',
  examType: 'MOCK',
  status: 'COMPLETED',
  academicSessionId: 'sess-1',
  sessionName: '2026/2027',
  academicTermId: 'term-1',
  termName: 'First Term',
  subjectId: 'sub-1',
  subjectName: 'Biology',
  departmentId: null,
  departmentName: null,
  createdByMembershipId: 'm1',
  createdByName: 'Teacher Doe',
  classes: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  durationSeconds: 3600,
  attemptLimit: 1,
  navigationPolicy: 'FREE',
  randomizeQuestions: false,
  randomizeOptions: false,
  resultPolicy: 'TEACHER',
  resultDetailVisibility: 'SCORE_ONLY',
  accessMode: 'OPEN_TO_ELIGIBLE',
  generalInstructions: null,
  navigationInstructions: null,
  submissionInstructions: null,
  accommodations: null,
  cancelledReason: null,
  cancelledAt: null,
  archivedAt: null,
  sections: [
    { id: 's1', title: 'Section A', sequence: 1, marks: 30, questions: [] },
    { id: 's2', title: 'Section B', sequence: 2, marks: 20, questions: [] },
  ],
};

function mockApi(responses: { exam?: unknown; examError?: boolean }) {
  mockGet.mockImplementation((path: string) => {
    const response = new Response(null, { status: 200 });
    if (path === '/reports/exams/{id}/results') return Promise.resolve({ data: results, response });
    if (path === '/exams/{id}') {
      return Promise.resolve(
        responses.examError
          ? { error: { code: 'FORBIDDEN' }, response: new Response(null, { status: 403 }) }
          : { data: responses.exam, response },
      );
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('PrintExamResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints the real result rows with the exam header and the participation summary', async () => {
    mockApi({ exam });
    renderWithClient(<PrintExamResultsView examId="exam-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('print-exam-results')).toBeInTheDocument();
    });
    expect(
      screen.getAllByText(/Biology Mock Examination — Subject: Biology/i).length,
    ).toBeGreaterThan(0);

    const sheet = screen.getByTestId('print-exam-results');
    // Total marks is the sum of the exam's sections, not a default.
    expect(within(sheet).getByText(/Total Marks:/).parentElement).toHaveTextContent(
      'Total Marks: 50',
    );
    expect(within(sheet).getByText(/Expected Candidates:/).parentElement).toHaveTextContent(
      'Expected Candidates: 4',
    );
    expect(within(sheet).getByText(/^Absent:/).parentElement).toHaveTextContent('Absent: 1');

    // A final result prints its score, identifier and grade.
    expect(screen.getByText('Chidi Obi')).toBeInTheDocument();
    expect(screen.getByText('ST-001')).toBeInTheDocument();
    expect(screen.getByText('42/50')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('Auto-submitted')).toBeInTheDocument();

    // A voided result stays visible but carries no score (ADR-0025).
    const voidedRow = screen.getByText('Amina Yusuf').closest('tr')!;
    expect(within(voidedRow).getByText('Voided')).toBeInTheDocument();
    expect(within(voidedRow).queryByText('0/50')).not.toBeInTheDocument();
    expect(within(voidedRow).queryByText('0%')).not.toBeInTheDocument();

    // No absent rows are fabricated from the summary.
    expect(screen.getAllByRole('row')).toHaveLength(1 + results.items.length);
    expect(screen.queryByText('No student results recorded for this examination.')).toBeNull();
  });

  it('still prints the results when the exam header cannot be read', async () => {
    mockApi({ examError: true });
    renderWithClient(<PrintExamResultsView examId="exam-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('print-exam-results')).toBeInTheDocument();
    });
    expect(screen.getByText('Chidi Obi')).toBeInTheDocument();
    expect(screen.getByText(/Total Marks:/).parentElement).toHaveTextContent('Total Marks: —');
    expect(screen.queryByText(/Total Marks: 100/)).toBeNull();
  });
});
