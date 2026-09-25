import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ReviewQueue } from './review-queue-screen';
import { ReviewWorkspace } from './review-workspace-screen';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function errorEnvelope(code: string, message: string) {
  return Promise.resolve({
    data: undefined,
    error: { error: { code, message, retryable: false, correlationId: 'corr-1' } },
    response: new Response(null, { status: 403 }),
  } as never);
}

const QUEUE = {
  subjects: [
    {
      subjectId: 'math',
      subjectName: 'Mathematics',
      pendingCount: 2,
      items: [
        {
          questionId: 'q1',
          subjectId: 'math',
          subjectName: 'Mathematics',
          level: 'SS2',
          authorTeacherProfileId: 'tp1',
          authorName: 'Mr Ade',
          submittedAt: '2026-09-01T00:00:00.000Z',
          revision: { content: '<p>What is 2 + 2?</p>' },
        },
        {
          questionId: 'q2',
          subjectId: 'math',
          subjectName: 'Mathematics',
          level: 'SS2',
          authorTeacherProfileId: 'tp2',
          authorName: 'Mrs Bello',
          submittedAt: '2026-09-02T00:00:00.000Z',
          revision: { content: '<p>What is 3 x 3?</p>' },
        },
      ],
    },
  ],
};

function workspaceFor(questionId: string) {
  return {
    questionId,
    subjectId: 'math',
    subjectName: 'Mathematics',
    level: 'SS2',
    authorTeacherProfileId: 'tp1',
    authorName: 'Mr Ade',
    currentRevision: {
      id: 'rev1',
      status: 'SUBMITTED',
      content: '<p>What is 2 + 2?</p>',
      difficulty: 'EASY',
      marks: 1,
      topicName: null,
      explanation: null,
      options: [
        { id: 'o1', content: '4', correctFlag: true },
        { id: 'o2', content: '3', correctFlag: false },
      ],
      media: [],
    },
    history: [],
  };
}

function wrap(ui: React.ReactElement) {
  // `retry: false` — the cross-department/error-path test below asserts on
  // the settled `isError` state; TanStack Query's default retry-with-backoff
  // would otherwise keep this mocked-always-failing query pending well past
  // `findByText`'s default timeout.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

/**
 * F10 DoD-mandated integration coverage ("Approve and reject against real
 * APIs"): the real `ReviewQueue`/`ReviewWorkspace`/`DecisionPanel`/
 * `ReviewDecisionDialog` component stack, real `lib/question-review/*`
 * hooks, mocking only `apiClient` at the HTTP boundary — the same technique
 * `question-editor-flow.integration.test.tsx` established.
 */
describe('Question review flow (F10)', () => {
  beforeEach(() => {
    push.mockReset();
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('the queue groups pending items by subject and links to the real review workspace', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/reviews/queue') return ok(QUEUE);
      throw new Error(`unexpected GET ${path}`);
    });
    render(wrap(<ReviewQueue />));
    expect(await screen.findByText(/mathematics/i)).toBeInTheDocument();
    expect(screen.getByText('Mr Ade')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /open review/i })[0]).toHaveAttribute(
      'href',
      '/hod/question-review/q1',
    );
  });

  it('approving calls the real approve endpoint and advances to the next queued question', async () => {
    mockGet.mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
        if (path === '/reviews/queue') return ok(QUEUE);
        if (path === '/reviews/questions/{id}') {
          return ok(workspaceFor(options?.params?.path?.id ?? 'q1'));
        }
        throw new Error(`unexpected GET ${path}`);
      },
    );
    mockPost.mockImplementation((path: string) => {
      if (path === '/reviews/questions/{id}/approve') return ok(workspaceFor('q1'));
      throw new Error(`unexpected POST ${path}`);
    });

    render(wrap(<ReviewWorkspace questionId="q1" />));
    expect(await screen.findByText(/what is 2 \+ 2\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(
      () => {
        expect(mockPost).toHaveBeenCalledWith(
          '/reviews/questions/{id}/approve',
          expect.objectContaining({ params: { path: { id: 'q1' } }, body: {} }),
        );
      },
      { timeout: 10000 },
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/hod/question-review/q2'), {
      timeout: 10000,
    });
  }, 30000);

  it('rejecting requires a reason, then calls the real reject endpoint', async () => {
    mockGet.mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
        if (path === '/reviews/queue') return ok(QUEUE);
        if (path === '/reviews/questions/{id}') {
          return ok(workspaceFor(options?.params?.path?.id ?? 'q2'));
        }
        throw new Error(`unexpected GET ${path}`);
      },
    );
    mockPost.mockImplementation((path: string) => {
      if (path === '/reviews/questions/{id}/reject') return ok(workspaceFor('q2'));
      throw new Error(`unexpected POST ${path}`);
    });

    render(wrap(<ReviewWorkspace questionId="q2" />));
    expect(await screen.findByText(/what is 2 \+ 2\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^reject question$/i }));
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/reason/i), 'Option B is ambiguous.');
    await userEvent.click(screen.getByRole('button', { name: /^reject question$/i }));

    await waitFor(
      () => {
        expect(mockPost).toHaveBeenCalledWith(
          '/reviews/questions/{id}/reject',
          expect.objectContaining({
            params: { path: { id: 'q2' } },
            body: { reason: 'Option B is ambiguous.' },
          }),
        );
      },
      { timeout: 10000 },
    );
    // q2 is the last item in queue order — no next question, back to the queue list.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/hod/question-review'), {
      timeout: 10000,
    });
  }, 30000);

  it('a cross-department (or otherwise unauthorized) question shows an error state, never raw JSON', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/reviews/queue') return ok({ subjects: [] });
      if (path === '/reviews/questions/{id}') {
        return errorEnvelope('NOT_FOUND', 'Question not found.');
      }
      throw new Error(`unexpected GET ${path}`);
    });
    render(wrap(<ReviewWorkspace questionId="q-out-of-scope" />));
    expect(await screen.findByText(/question not found/i)).toBeInTheDocument();
  });
});
