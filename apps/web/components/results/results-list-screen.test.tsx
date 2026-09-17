import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ResultsListScreen } from './results-list-screen';

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

describe('ResultsListScreen', () => {
  it('shows a loading skeleton while the query is pending', () => {
    mockGet.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<ResultsListScreen />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('DoD 9 — shows the "no results yet" empty state', async () => {
    mockGet.mockResolvedValue(ok({ items: [] }));
    renderWithClient(<ResultsListScreen />);
    expect(await screen.findByText(/no results yet/i)).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', async () => {
    mockGet.mockResolvedValue({
      error: { error: { code: 'INTERNAL', message: 'boom', retryable: true, correlationId: 'c1' } },
      response: new Response(null, { status: 500 }),
    });
    renderWithClient(<ResultsListScreen />);
    expect(await screen.findByText(/couldn't load your results/i)).toBeInTheDocument();
  });

  it('DoD 4/9 — renders each published result with subject, exam title, percentage, and grade', async () => {
    mockGet.mockResolvedValue(
      ok({
        items: [
          {
            id: 'result-1',
            examId: 'exam-1',
            examTitle: 'First Term Examination',
            subjectName: 'Mathematics',
            examType: 'Examination',
            totalMarks: 50,
            earnedMarks: 43,
            percentage: 86,
            grade: 'A',
            publishedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    );
    renderWithClient(<ResultsListScreen />);
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('First Term Examination')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /first term examination/i })).toHaveAttribute(
      'href',
      'results/result-1',
    );
  });
});
