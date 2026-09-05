import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraceWindowBanner } from './grace-window-banner';
import { getAttemptDb, clearAttemptData } from '@/lib/attempt/db';

const ATTEMPT_ID = 'attempt-grace-1';

describe('GraceWindowBanner', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('renders nothing when no answer is window-closed', () => {
    render(<GraceWindowBanner attemptId={ATTEMPT_ID} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ADR-0003 — names the specific question and requires explicit acknowledgement', async () => {
    const db = getAttemptDb();
    await db.questions.put({
      attemptId: ATTEMPT_ID,
      examQuestionId: 'q1',
      displaySequence: 3,
      marks: 1,
      questionType: 'MULTIPLE_CHOICE',
      content: '<p>Q</p>',
      options: [],
      media: [],
    });
    await db.answers.put({
      attemptId: ATTEMPT_ID,
      examQuestionId: 'q1',
      selectedOptionId: 'o1',
      localSequence: 1,
      syncStatus: 'window-closed',
      lastServerSequence: null,
      lastSyncedAt: null,
      lastAttemptedAt: null,
      rejectionCode: 'ATTEMPT_WRITE_WINDOW_CLOSED',
      acknowledged: false,
      updatedAt: new Date().toISOString(),
    });

    render(<GraceWindowBanner attemptId={ATTEMPT_ID} />);
    expect(await screen.findByText(/question 3 could not be saved/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /i understand/i }));

    await waitFor(async () => {
      const row = await db.answers.get([ATTEMPT_ID, 'q1']);
      expect(row?.acknowledged).toBe(true);
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
