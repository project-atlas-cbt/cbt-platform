import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrintExamResultsView } from './print-exam-results-view';
import { apiClient } from '@/lib/api';

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
}));

const mockGet = vi.mocked(apiClient.GET);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('PrintExamResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student rows and truthfully preserves ABSENT status without converting to 0 (DoD #4)', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        exam: {
          id: 'exam-1',
          title: 'Biology Mock Examination',
          totalMarks: 50,
          subject: { name: 'Biology', code: 'BIO' },
        },
        results: [
          {
            id: 'r1',
            studentId: 'ST-001',
            studentName: 'Chidi Obi',
            className: 'SS3A',
            earnedMarks: 42,
            totalMarks: 50,
            percentage: 84,
            grade: 'A',
            state: 'COMPLETED',
          },
          {
            id: 'r2',
            studentId: 'ST-002',
            studentName: 'Amina Yusuf',
            className: 'SS3A',
            earnedMarks: null,
            totalMarks: null,
            percentage: null,
            grade: null,
            state: 'ABSENT',
          },
        ],
        summary: {
          totalCandidates: 2,
          presentCount: 1,
          absentCount: 1,
        },
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<PrintExamResultsView examId="exam-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('print-exam-results')).toBeInTheDocument();
      expect(
        screen.getAllByText(/Biology Mock Examination — Subject: Biology/i).length,
      ).toBeGreaterThan(0);
    });

    // Verify Completed student
    expect(screen.getByText('Chidi Obi')).toBeInTheDocument();
    expect(screen.getByText('42/50')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();

    // Verify Absent student: preserves ABSENT status truthfully and shows '—', NOT '0' or '0%'
    expect(screen.getByText('Amina Yusuf')).toBeInTheDocument();
    expect(screen.getByText('ABSENT')).toBeInTheDocument();
    expect(screen.queryByText('0/50')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
