import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { ExamCancelDialog } from './exam-cancel-dialog';

describe('ExamCancelDialog', () => {
  it('blocks submission client-side when the reason is empty (DoD item 10)', async () => {
    const onConfirm = vi.fn();
    render(<ExamCancelDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel exam/i }));
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits the typed reason and closes on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ExamCancelDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    await userEvent.type(screen.getByLabelText(/reason/i), 'Duplicate of another exam.');
    await userEvent.click(screen.getByRole('button', { name: /cancel exam/i }));
    expect(onConfirm).toHaveBeenCalledWith('Duplicate of another exam.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open and shows an inline error when the mutation rejects — never optimistic', async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiError({
        code: 'EXAM_NOT_CANCELLABLE',
        message: 'This exam can no longer be cancelled.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    const onOpenChange = vi.fn();
    render(<ExamCancelDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    await userEvent.type(screen.getByLabelText(/reason/i), 'A real reason.');
    await userEvent.click(screen.getByRole('button', { name: /cancel exam/i }));
    expect(await screen.findByText('This exam can no longer be cancelled.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
