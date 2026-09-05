import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { AssessmentHome } from './assessment-home';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AssessmentHome', () => {
  it('shows a loading skeleton while the query is pending', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<AssessmentHome />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('DoD 1 — shows the honest empty state when no assessment is available', async () => {
    mockGet.mockResolvedValue(
      ok({ examId: null, examTitle: null, examSessionId: null, attemptId: null, state: null }),
    );
    renderWithClient(<AssessmentHome />);
    expect(await screen.findByText(/no assessment is currently available/i)).toBeInTheDocument();
  });

  it('DoD 1 — shows the available assessment with a "View details" action', async () => {
    mockGet.mockResolvedValue(
      ok({
        examId: 'exam-1',
        examTitle: 'Mid-Term Mathematics',
        examSessionId: 'sess-1',
        attemptId: null,
        state: null,
      }),
    );
    renderWithClient(<AssessmentHome />);
    expect(await screen.findByText('Mid-Term Mathematics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
  });

  it('an already-in-progress attempt offers "Resume assessment" straight into the runtime', async () => {
    mockGet.mockResolvedValue(
      ok({
        examId: 'exam-1',
        examTitle: 'Mid-Term',
        examSessionId: 'sess-1',
        attemptId: 'attempt-9',
        state: 'IN_PROGRESS',
      }),
    );
    renderWithClient(<AssessmentHome />);
    const button = await screen.findByRole('button', { name: /resume assessment/i });
    button.click();
    expect(push).toHaveBeenCalledWith('/student/exam/attempt-9');
  });

  it('shows an error state with retry on failure', async () => {
    mockGet.mockResolvedValue({
      error: { error: { code: 'INTERNAL', message: 'boom', retryable: true, correlationId: 'c1' } },
      response: new Response(null, { status: 500 }),
    });
    renderWithClient(<AssessmentHome />);
    expect(await screen.findByText(/couldn't load your assessment/i)).toBeInTheDocument();
  });
});
