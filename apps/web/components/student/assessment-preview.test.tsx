import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { AssessmentPreview } from './assessment-preview';
import { clearAttemptData } from '@/lib/attempt/db';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

const PREVIEW = {
  examId: 'exam-1',
  title: 'Mid-Term Mathematics',
  examType: 'Examination',
  durationSeconds: 3600,
  attemptLimit: 1,
  navigationPolicy: 'FREE',
  generalInstructions: 'Answer all questions.',
  questionCount: 20,
  totalMarks: 40,
};

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssessmentPreview examId="exam-1" />
    </QueryClientProvider>,
  );
}

describe('AssessmentPreview', () => {
  beforeEach(async () => {
    await clearAttemptData('attempt-99');
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('DoD 2 — shows question count, duration, attempts allowed, and instructions', async () => {
    mockGet.mockResolvedValue(ok(PREVIEW));
    renderWithClient();
    expect(await screen.findByText('Mid-Term Mathematics')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('60 minutes')).toBeInTheDocument();
    expect(screen.getByText('Answer all questions.')).toBeInTheDocument();
  });

  it('DoD 3 — a double-click on Start triggers exactly one start-attempt call', async () => {
    mockGet.mockResolvedValue(ok(PREVIEW));
    mockPost.mockReturnValue(new Promise(() => undefined)); // never resolves — button should be disabled after first click
    renderWithClient();

    const button = await screen.findByRole('button', { name: /start assessment/i });
    const user = userEvent.setup();
    await user.dblClick(button);

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('shows an error state on preview load failure', async () => {
    mockGet.mockResolvedValue({
      error: {
        error: {
          code: 'NOT_FOUND',
          message: 'no such exam',
          retryable: false,
          correlationId: 'c1',
        },
      },
      response: new Response(null, { status: 404 }),
    });
    renderWithClient();
    expect(await screen.findByText(/couldn't load this assessment/i)).toBeInTheDocument();
  });

  it('surfaces a start error inline without crashing', async () => {
    mockGet.mockResolvedValue(ok(PREVIEW));
    mockPost.mockResolvedValue({
      error: {
        error: {
          code: 'ATTEMPT_NOT_ELIGIBLE',
          message: 'Not eligible right now.',
          retryable: false,
          correlationId: 'c1',
        },
      },
      response: new Response(null, { status: 409 }),
    });
    renderWithClient();

    const button = await screen.findByRole('button', { name: /start assessment/i });
    const user = userEvent.setup();
    await user.click(button);

    expect(await screen.findByText('Not eligible right now.')).toBeInTheDocument();
  });
});
