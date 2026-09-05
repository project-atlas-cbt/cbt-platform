import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionNavigator } from './question-navigator';
import { getAttemptDb, clearAttemptData } from '@/lib/attempt/db';

const ATTEMPT_ID = 'attempt-nav-1';

async function seedAnswer(examQuestionId: string, selectedOptionId: string | null) {
  await getAttemptDb().answers.put({
    attemptId: ATTEMPT_ID,
    examQuestionId,
    selectedOptionId,
    localSequence: 1,
    syncStatus: 'synced',
    lastServerSequence: 1,
    lastSyncedAt: null,
    lastAttemptedAt: null,
    rejectionCode: null,
    acknowledged: false,
    updatedAt: new Date().toISOString(),
  });
}

describe('QuestionNavigator', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('DoD 5 — renders exactly the unanswered/answered/current states', async () => {
    await seedAnswer('q1', 'o1'); // answered
    const onNavigate = vi.fn();
    render(
      <QuestionNavigator
        attemptId={ATTEMPT_ID}
        questionIds={['q1', 'q2', 'q3']}
        currentIndex={1}
        furthestIndex={2}
        navigationPolicy="FREE"
        onNavigate={onNavigate}
      />,
    );

    expect(
      await screen.findByRole('button', { name: /question 1, answered/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /question 2, unanswered, current/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /question 3, unanswered/i })).toBeInTheDocument();
  });

  it('DoD 5 — disables a jump the navigation policy disallows', () => {
    render(
      <QuestionNavigator
        attemptId={ATTEMPT_ID}
        questionIds={['q1', 'q2', 'q3']}
        currentIndex={2}
        furthestIndex={2}
        navigationPolicy="SEQUENTIAL_NO_REVISIT"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /question 1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /question 3/i })).not.toBeDisabled();
  });

  it('clicking an allowed question calls onNavigate with its index', () => {
    const onNavigate = vi.fn();
    render(
      <QuestionNavigator
        attemptId={ATTEMPT_ID}
        questionIds={['q1', 'q2']}
        currentIndex={0}
        furthestIndex={1}
        navigationPolicy="FREE"
        onNavigate={onNavigate}
      />,
    );
    screen.getByRole('button', { name: /question 2/i }).click();
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('bug fix — a window-closed answer shows as unanswered, not answered', async () => {
    await getAttemptDb().answers.put({
      attemptId: ATTEMPT_ID,
      examQuestionId: 'q1',
      selectedOptionId: 'o1', // the student picked one...
      localSequence: 1,
      syncStatus: 'window-closed', // ...but the server never accepted it
      lastServerSequence: null,
      lastSyncedAt: null,
      lastAttemptedAt: null,
      rejectionCode: 'ATTEMPT_WRITE_WINDOW_CLOSED',
      acknowledged: false,
      updatedAt: new Date().toISOString(),
    });
    render(
      <QuestionNavigator
        attemptId={ATTEMPT_ID}
        questionIds={['q1', 'q2']}
        currentIndex={1}
        furthestIndex={1}
        navigationPolicy="FREE"
        onNavigate={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('button', { name: /question 1, unanswered/i }),
    ).toBeInTheDocument();
  });
});
