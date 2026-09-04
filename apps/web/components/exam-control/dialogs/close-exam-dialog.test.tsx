import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { CloseExamDialog } from './close-exam-dialog';

/**
 * F12 — ADR-0009 / DoD item 4: this copy is a named Definition-of-Done
 * item, not incidental — asserted as a literal text-content check, mirroring
 * this project's own established practice for DoD-mandated copy.
 */
describe('CloseExamDialog', () => {
  it('states unmistakably, at the point of action, that a running attempt is NOT affected (ADR-0009)', () => {
    render(<CloseExamDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(
      screen.getByText(
        /can continue and submit normally — closing does not stop or affect a running attempt/i,
      ),
    ).toBeInTheDocument();
  });

  it('confirms and closes on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<CloseExamDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /^close exam$/i }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open and shows the server error when the mutation rejects — never optimistic', async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiError({
        code: 'EXAM_NOT_OPEN',
        message: 'This exam is not currently open.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    const onOpenChange = vi.fn();
    render(<CloseExamDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /^close exam$/i }));
    expect(await screen.findByText('This exam is not currently open.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
