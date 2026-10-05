import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiComponents } from '@atlas/contracts';
import { PrintExamPerformanceView } from './print-exam-performance-view';
import { PrintClassPerformanceView } from './print-class-performance-view';
import { PrintStudentPerformanceView } from './print-student-performance-view';
import { apiClient } from '@/lib/api';
import type {
  PrintClassPerformanceData,
  PrintExamPerformanceData,
  PrintStudentPerformanceData,
} from '@/lib/reports/types';

type Schemas = ApiComponents['schemas'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/tenant', () => ({
  useTenant: () => ({ school: { name: 'Greenfield College', logoUrl: null } }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    me: { user: { displayName: 'Admin Doe' }, membership: { loginIdentifier: 'A01' } },
  }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: { GET: vi.fn() },
  toApiError: () => new Error('API Error'),
  unwrap: async (resultPromise: Promise<{ data?: unknown; error?: unknown }>) => {
    const result = await resultPromise;
    if (result.error !== undefined) throw new Error('API Error');
    return result.data;
  },
  resolveApiOrigin: () => 'http://localhost:3001',
}));

const mockGet = vi.mocked(apiClient.GET);

function mockRoutes(routes: Record<string, unknown>) {
  mockGet.mockImplementation((path: string) => {
    if (!(path in routes)) throw new Error(`unexpected GET ${path}`);
    return Promise.resolve({ data: routes[path], response: new Response(null, { status: 200 }) });
  });
}

function permissions(...resources: string[]): Schemas['MePermissionsResponseDto'] {
  return {
    roles: ['SCHOOL_ADMIN'],
    permissions: resources.map((resource) => ({
      resource,
      section: 'Test',
      label: resource,
      action: 'READ',
      scope: 'SCHOOL',
      breakGlass: false,
    })),
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const metric = {
  averagePercentage: 68.5,
  highestPercentage: 94,
  lowestPercentage: 31,
  passRate: 75,
  resultCount: 4,
};

describe('PrintExamPerformanceView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints the analytics summary and joins item analysis to the exam questions', async () => {
    const performance: PrintExamPerformanceData = {
      summary: {
        examId: 'exam-1',
        ...metric,
        voidedResultCount: 0,
        participation: {
          expectedStudentCount: 5,
          attendedCount: 4,
          absentCount: 1,
          pendingCount: 0,
          completionRate: 80,
        },
        distribution: [],
        classBreakdown: [],
      },
      questions: {
        examId: 'exam-1',
        items: [
          {
            examQuestionId: 'eq-1',
            sequence: 1,
            questionId: 'q-1',
            questionType: 'MCQ_SINGLE',
            subjectId: 'sub-1',
            topicName: 'Photosynthesis',
            exposureCount: 4,
            correctCount: 3,
            incorrectCount: 1,
            unansweredCount: 0,
            correctRate: 75,
            incorrectRate: 25,
            unansweredRate: 0,
            voidedForScoring: false,
          },
        ],
      },
    };
    const exam = {
      id: 'exam-1',
      title: 'Biology Mock',
      subjectName: 'Biology',
      sections: [
        {
          id: 's1',
          title: 'Section A',
          sequence: 1,
          marks: 2,
          questions: [
            {
              id: 'eq-1',
              questionId: 'q-1',
              questionRevisionId: 'rev-1',
              sequence: 1,
              marks: 2,
              content: '<p>Which organelle performs photosynthesis?</p>',
              questionType: 'MCQ_SINGLE',
              difficulty: 'HARD',
              topicName: 'Photosynthesis',
            },
          ],
        },
      ],
    } satisfies Partial<Schemas['ExamResponseDto']>;
    mockRoutes({ '/reports/exams/{id}/performance': performance, '/exams/{id}': exam });

    renderWithClient(<PrintExamPerformanceView examId="exam-1" />);
    await waitFor(() => expect(screen.getByTestId('print-exam-performance')).toBeInTheDocument());

    expect(screen.getAllByText(/Biology Mock — Biology — Item Diagnostics/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('68.5%')).toBeInTheDocument();
    expect(screen.getByText('31% – 94%')).toBeInTheDocument();

    const row = screen.getByText('Photosynthesis').closest('tr')!;
    expect(within(row).getByText('Which organelle performs photosynthesis?')).toBeInTheDocument();
    expect(within(row).getByText('hard')).toBeInTheDocument();
    expect(within(row).getByText('75%')).toBeInTheDocument();
  });
});

describe('PrintClassPerformanceView', () => {
  beforeEach(() => vi.clearAllMocks());

  const classReport: PrintClassPerformanceData = {
    classId: 'class-1',
    ...metric,
    participation: {
      expectedStudentCount: 10,
      attendedCount: 9,
      absentCount: 1,
      pendingCount: 0,
      completionRate: 90,
    },
    subjects: [{ id: 'sub-1', name: 'Mathematics', ...metric, averagePercentage: 71 }],
    exams: [],
  };

  it('prints subject averages with the class name and roster size when permitted', async () => {
    mockRoutes({
      '/me/permissions': permissions('schoolConfig.class.view', 'assignments.view'),
      '/reports/classes/{id}/performance': classReport,
      '/academics/classes/{id}': { id: 'class-1', name: 'SS2A', level: 'SS2', arm: 'A' },
      '/classes/{id}/students': {
        students: [
          { enrollmentId: 'e1', studentProfileId: 'sp1', studentId: 'S1', displayName: 'A' },
          { enrollmentId: 'e2', studentProfileId: 'sp2', studentId: 'S2', displayName: 'B' },
        ],
      },
    });

    renderWithClient(<PrintClassPerformanceView classId="class-1" />);
    await waitFor(() => expect(screen.getByTestId('print-class-performance')).toBeInTheDocument());

    expect(screen.getAllByText(/Class: SS2A — Performance Summary/).length).toBeGreaterThan(0);
    expect(screen.getByText('68.5%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    const row = screen.getByText('Mathematics').closest('tr')!;
    expect(within(row).getByText('71%')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
  });

  it('does not request class details the viewer may not read', async () => {
    mockRoutes({
      '/me/permissions': permissions(),
      '/reports/classes/{id}/performance': classReport,
    });

    renderWithClient(<PrintClassPerformanceView classId="class-1" />);
    await waitFor(() => expect(screen.getByTestId('print-class-performance')).toBeInTheDocument());

    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/academics/classes/{id}', expect.anything());
    expect(mockGet).not.toHaveBeenCalledWith('/classes/{id}/students', expect.anything());
  });
});

describe('PrintStudentPerformanceView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints the student history with the student record', async () => {
    const report: PrintStudentPerformanceData = {
      studentProfileId: 'sp-1',
      ...metric,
      history: [
        {
          examId: 'exam-1',
          examTitle: 'First Term Exam',
          subjectName: 'Chemistry',
          percentage: 82,
          grade: 'A',
          finalizedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    };
    mockRoutes({
      '/me/permissions': permissions('users.student.view'),
      '/reports/students/{id}/performance': report,
      '/students/{id}': {
        studentProfileId: 'sp-1',
        displayName: 'Ngozi Eze',
        studentId: 'STU-0042',
        admissionNumber: null,
        currentClassName: 'SS3B',
      } satisfies Partial<Schemas['StudentResponseDto']>,
    });

    renderWithClient(<PrintStudentPerformanceView studentId="sp-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('print-student-performance')).toBeInTheDocument(),
    );

    expect(screen.getAllByText(/Candidate: Ngozi Eze/).length).toBeGreaterThan(0);
    expect(screen.getByText(/STU-0042/)).toBeInTheDocument();
    expect(screen.getByText(/SS3B/)).toBeInTheDocument();
    expect(screen.getByText(/68.5%/)).toBeInTheDocument();
    const row = screen.getByText('Chemistry').closest('tr')!;
    expect(within(row).getByText('First Term Exam')).toBeInTheDocument();
    expect(within(row).getByText('82%')).toBeInTheDocument();
    expect(within(row).getByText('A')).toBeInTheDocument();
  });
});
