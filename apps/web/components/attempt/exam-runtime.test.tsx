import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { ExamRuntime } from './exam-runtime';
import { clearAttemptData, getAttemptDb } from '@/lib/attempt/db';
import { resetServerClock } from '@/lib/attempt/server-clock';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

const ATTEMPT_ID = 'attempt-runtime-1';

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

const PACKAGE = {
  attemptId: ATTEMPT_ID,
  examId: 'exam-1',
  examSessionId: 'session-1',
  state: 'IN_PROGRESS',
  startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  serverTime: new Date().toISOString(),
  navigationPolicy: 'FREE',
  generalInstructions: null,
  navigationInstructions: null,
  questions: [
    {
      examQuestionId: 'q1',
      displaySequence: 1,
      marks: 1,
      questionType: 'MULTIPLE_CHOICE',
      content: '<p>What is 2+2?</p>',
      options: [
        { optionId: 'o1', content: '3', displayPosition: 1 },
        { optionId: 'o2', content: '4', displayPosition: 2 },
      ],
      media: [],
      selectedOptionId: null,
      answerSequenceNumber: 0,
    },
    {
      examQuestionId: 'q2',
      displaySequence: 2,
      marks: 1,
      questionType: 'MULTIPLE_CHOICE',
      content: '<p>What is 3+3?</p>',
      options: [
        { optionId: 'o3', content: '5', displayPosition: 1 },
        { optionId: 'o4', content: '6', displayPosition: 2 },
      ],
      media: [],
      selectedOptionId: null,
      answerSequenceNumber: 0,
    },
  ],
};

function renderRuntime() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExamRuntime attemptId={ATTEMPT_ID} />
    </QueryClientProvider>,
  );
}

describe('ExamRuntime (integration)', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
    await getAttemptDb().answers.where('attemptId').equals(ATTEMPT_ID).delete();
    resetServerClock();
    mockGet.mockReset();
    mockPost.mockReset();
    replace.mockReset();
    mockGet.mockResolvedValue(ok(PACKAGE));
    mockPost.mockImplementation((path: unknown) => {
      if (path === '/attempts/{id}/answers/batch') {
        return ok({
          results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }],
        }) as never;
      }
      if (path === '/attempts/{id}/submit') {
        return ok({
          attemptId: ATTEMPT_ID,
          examId: 'exam-1',
          examSessionId: 'session-1',
          state: 'SUBMITTED',
          startedAt: PACKAGE.startedAt,
          expiresAt: PACKAGE.expiresAt,
          submittedAt: new Date().toISOString(),
          invalidationReason: null,
        }) as never;
      }
      return ok({ status: 'ok' }) as never;
    });
  });

  it('DoD 4 — renders the question surface: number, content, options, navigator, submit', async () => {
    renderRuntime();
    expect(await screen.findByText(/question 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    expect(screen.getByLabelText('4')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /question navigator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit assessment/i })).toBeInTheDocument();
  });

  it('DoD 5/6 — selecting an option persists locally immediately and marks the navigator "answered"', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('4'));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /question 1, answered, current/i }),
      ).toBeInTheDocument(),
    );
  });

  it('Next moves to the second question', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('What is 3+3?')).toBeInTheDocument();
  });

  it('DoD 14 — the submit dialog reports an accurate unanswered count', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('4'));
    await waitFor(() => screen.getByRole('button', { name: /question 1, answered, current/i }));

    await user.click(screen.getByRole('button', { name: /submit assessment/i }));
    expect(await screen.findByText(/1 unanswered question out of 2/i)).toBeInTheDocument();
  });

  it('confirming submit flushes pending answers, submits, and navigates to the confirmation screen', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/student/exam/${ATTEMPT_ID}/submitted`),
    );
    expect(mockPost).toHaveBeenCalledWith('/attempts/{id}/submit', expect.anything());
  });

  it('DoD 17 — an invalidated attempt shows the terminal screen instead of the runtime', async () => {
    mockGet.mockResolvedValue(ok({ ...PACKAGE, state: 'INVALIDATED' }));
    renderRuntime();
    expect(await screen.findByText(/this attempt has been ended/i)).toBeInTheDocument();
    expect(screen.queryByText('What is 2+2?')).not.toBeInTheDocument();
  });

  it('bug fix — an invalidated attempt shows the real server-provided reason, not just the generic fallback', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...PACKAGE,
        state: 'INVALIDATED',
        invalidationReason: 'Suspected integrity violation.',
      }),
    );
    renderRuntime();
    expect(await screen.findByText('Suspected integrity violation.')).toBeInTheDocument();
  });

  it('bug fix — a failed submit surfaces an error in the dialog instead of failing silently', async () => {
    mockPost.mockImplementation((path: unknown) => {
      if (path === '/attempts/{id}/answers/batch') {
        return ok({
          results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }],
        }) as never;
      }
      if (path === '/attempts/{id}/submit') {
        return Promise.reject(new Error('network down')) as never;
      }
      return ok({ status: 'ok' }) as never;
    });
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/try submitting again/i);
    // The failure never silently navigated away, and the dialog is still
    // actionable — the student can retry once reconnected.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('audit P0-2 — a manual submit is refused while an answer has not reached the server', async () => {
    mockPost.mockImplementation((path: unknown) => {
      if (path === '/attempts/{id}/answers/batch') {
        return Promise.reject(new Error('network down')) as never;
      }
      return ok({ status: 'ok' }) as never;
    });
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('4'));
    await user.click(screen.getByRole('button', { name: /submit assessment/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert', {}, { timeout: 10_000 })).toHaveTextContent(
      /1 answer hasn't reached the server yet/i,
    );
    expect(mockPost).not.toHaveBeenCalledWith('/attempts/{id}/submit', expect.anything());
    expect(replace).not.toHaveBeenCalled();
    expect((await getAttemptDb().answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('pending');
  }, 15_000);

  it('audit P0-2 — at expiry, an unsynced answer is sent before the submit', async () => {
    const calls: string[] = [];
    let batchCalls = 0;
    mockPost.mockImplementation((path: unknown) => {
      calls.push(String(path));
      if (path === '/attempts/{id}/answers/batch') {
        batchCalls += 1;
        if (batchCalls === 1) return Promise.reject(new Error('network down')) as never;
        return ok({
          results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }],
        }) as never;
      }
      if (path === '/attempts/{id}/submit') {
        return ok({ ...PACKAGE, state: 'AUTO_SUBMITTED', submittedAt: null }) as never;
      }
      return ok({ status: 'ok' }) as never;
    });
    const now = Date.now();
    mockGet.mockResolvedValue(
      ok({
        ...PACKAGE,
        expiresAt: new Date(now + 2_500).toISOString(),
        serverTime: new Date(now).toISOString(),
      }),
    );
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('4'));

    await waitFor(
      () => expect(replace).toHaveBeenCalledWith(`/student/exam/${ATTEMPT_ID}/submitted`),
      { timeout: 10_000 },
    );
    const submitAt = calls.indexOf('/attempts/{id}/submit');
    const lastBatchAt = calls.lastIndexOf('/attempts/{id}/answers/batch');
    expect(batchCalls).toBeGreaterThanOrEqual(2);
    expect(lastBatchAt).toBeLessThan(submitAt);
    expect((await getAttemptDb().answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('synced');
  }, 15_000);

  it('audit P1-6 — a reload resumes at the saved question, and SEQUENTIAL_NO_REVISIT keeps passed questions locked', async () => {
    mockGet.mockResolvedValue(ok({ ...PACKAGE, navigationPolicy: 'SEQUENTIAL_NO_REVISIT' }));
    const first = renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('What is 3+3?')).toBeInTheDocument();
    await waitFor(async () =>
      expect((await getAttemptDb().attemptPackages.get(ATTEMPT_ID))?.furthestIndex).toBe(1),
    );
    first.unmount();

    renderRuntime();
    expect(await screen.findByText('What is 3+3?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('What is 3+3?')).toBeInTheDocument();
    expect(screen.queryByText('What is 2+2?')).not.toBeInTheDocument();
  });

  it('DoD 16 — an already-submitted attempt redirects to the confirmation screen rather than rendering the runtime', async () => {
    mockGet.mockResolvedValue(ok({ ...PACKAGE, state: 'SUBMITTED' }));
    renderRuntime();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/student/exam/${ATTEMPT_ID}/submitted`),
    );
    expect(screen.queryByText('What is 2+2?')).not.toBeInTheDocument();
  });

  it('F20 (DoD 2) — focus starts on the first question heading once the paper renders', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /question 1 of 2/i })).toHaveFocus(),
    );
  });

  it('F20 (DoD 2) — Alt+N / Alt+P move between questions and focus the new question heading', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    const user = userEvent.setup();

    await user.keyboard('{Alt>}n{/Alt}');
    expect(await screen.findByText('What is 3+3?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /question 2 of 2/i })).toHaveFocus();

    await user.keyboard('{Alt>}p{/Alt}');
    expect(await screen.findByText('What is 2+2?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /question 1 of 2/i })).toHaveFocus();

    // Past the ends: nothing happens.
    await user.keyboard('{Alt>}p{/Alt}');
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
  });

  it('F20 (DoD 2) — a page heading, a skip link and an answer group named by its question', async () => {
    renderRuntime();
    await screen.findByText('What is 2+2?');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to question/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /question 1 of 2/i })).toBeInTheDocument();
  });

  it('F20 (DoD 3) — the larger-text accommodation scales the runtime and is undone on leave', async () => {
    mockGet.mockResolvedValue(ok({ ...PACKAGE, largerText: true }));
    const view = renderRuntime();
    await screen.findByText('What is 2+2?');
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('125%'));
    view.unmount();
    expect(document.documentElement.style.fontSize).toBe('');
  });
});
