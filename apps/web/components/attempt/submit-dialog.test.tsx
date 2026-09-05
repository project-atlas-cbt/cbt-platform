import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmitDialog } from './submit-dialog';
import { getAttemptDb, clearAttemptData } from '@/lib/attempt/db';

const ATTEMPT_ID = 'attempt-submit-1';

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

describe('SubmitDialog', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('DoD 14 — warns with an accurate unanswered count', async () => {
    await seedAnswer('q1', 'o1');
    await seedAnswer('q2', null);
    render(
      <SubmitDialog
        attemptId={ATTEMPT_ID}
        questionCount={3}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        submitting={false}
      />,
    );
    expect(await screen.findByText(/2 unanswered questions out of 3/i)).toBeInTheDocument();
  });

  it('shows a positive confirmation when every question is answered', async () => {
    await seedAnswer('q1', 'o1');
    render(
      <SubmitDialog
        attemptId={ATTEMPT_ID}
        questionCount={1}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        submitting={false}
      />,
    );
    expect(await screen.findByText(/you've answered all 1 questions/i)).toBeInTheDocument();
  });

  it('calls onConfirm when Submit is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <SubmitDialog
        attemptId={ATTEMPT_ID}
        questionCount={1}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        submitting={false}
      />,
    );
    (await screen.findByRole('button', { name: 'Submit' })).click();
    expect(onConfirm).toHaveBeenCalled();
  });
});
