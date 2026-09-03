import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { ReviewDecisionDialog } from './review-decision-dialog';

describe('ReviewDecisionDialog', () => {
  it('blocks submission client-side when the reason is empty (DoD item 5)', async () => {
    const onConfirm = vi.fn();
    render(
      <ReviewDecisionDialog open onOpenChange={vi.fn()} variant="reject" onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /reject question/i }));
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits the typed reason and closes on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ReviewDecisionDialog
        open
        onOpenChange={onOpenChange}
        variant="requestChanges"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'Please clarify option B.');
    await userEvent.click(screen.getByRole('button', { name: /request changes/i }));
    expect(onConfirm).toHaveBeenCalledWith('Please clarify option B.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open and shows an inline error when the mutation rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiError({
        code: 'SOMETHING_ELSE',
        message: 'Could not reject this question.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <ReviewDecisionDialog
        open
        onOpenChange={onOpenChange}
        variant="reject"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'A real reason.');
    await userEvent.click(screen.getByRole('button', { name: /reject question/i }));
    expect(await screen.findByText('Could not reject this question.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
