import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { clearAttemptData } from '@/lib/attempt/db';
import { SubmittedScreen } from './submitted-screen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);

vi.mock('@/lib/attempt/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/attempt/db')>('@/lib/attempt/db');
  return { ...actual, clearAttemptData: vi.fn().mockResolvedValue(undefined) };
});
const mockClearAttemptData = vi.mocked(clearAttemptData);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubmittedScreen attemptId="attempt-1" />
    </QueryClientProvider>,
  );
}

const MARKING_NOT_APPLICABLE = {
  attemptId: 'attempt-1',
  examId: 'exam-1',
  state: 'SUBMITTED',
  submittedAt: new Date().toISOString(),
  marking: {
    status: 'NOT_APPLICABLE',
    questionCount: 0,
    markedCount: 0,
  },
};

describe('SubmittedScreen', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockClearAttemptData.mockClear();
  });

  it('bug fix — clears the attempt’s local IndexedDB state once the confirmation screen is reached', async () => {
    mockGet.mockResolvedValue(ok(MARKING_NOT_APPLICABLE));
    renderWithClient();
    await screen.findByText(/your assessment has been submitted/i);
    expect(mockClearAttemptData).toHaveBeenCalledWith('attempt-1');
  });

  it('pilot feedback — offers Go home back to the Assessment screen', async () => {
    mockGet.mockResolvedValue(ok(MARKING_NOT_APPLICABLE));
    renderWithClient();
    expect(await screen.findByRole('link', { name: /go home/i })).toHaveAttribute(
      'href',
      '/student',
    );
  });

  it('DoD 16 — confirms submission', async () => {
    mockGet.mockResolvedValue(ok(MARKING_NOT_APPLICABLE));
    renderWithClient();
    expect(await screen.findByText(/your assessment has been submitted/i)).toBeInTheDocument();
  });

  it('DoD 15 — shows the auto-submit notice for an AUTO_SUBMITTED attempt', async () => {
    mockGet.mockResolvedValue(ok({ ...MARKING_NOT_APPLICABLE, state: 'AUTO_SUBMITTED' }));
    renderWithClient();
    expect(await screen.findByText(/submitted automatically/i)).toBeInTheDocument();
  });

  it('does not show the auto-submit notice for a manual submission', async () => {
    mockGet.mockResolvedValue(ok(MARKING_NOT_APPLICABLE));
    renderWithClient();
    await screen.findByText(/your assessment has been submitted/i);
    expect(screen.queryByText(/submitted automatically/i)).not.toBeInTheDocument();
  });

  it('shows a pending-marking message while marking.status is PENDING', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...MARKING_NOT_APPLICABLE,
        marking: { ...MARKING_NOT_APPLICABLE.marking, status: 'PENDING' },
      }),
    );
    renderWithClient();
    expect(await screen.findByText(/being marked/i)).toBeInTheDocument();
  });

  it('never shows a score or counts once marking is COMPLETE, only that results follow the school policy', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...MARKING_NOT_APPLICABLE,
        marking: { status: 'COMPLETE', questionCount: 10, markedCount: 10 },
      }),
    );
    renderWithClient();
    expect(
      await screen.findByText(/available according to your school.s result policy/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/score|correct|incorrect/i)).not.toBeInTheDocument();
  });
});
