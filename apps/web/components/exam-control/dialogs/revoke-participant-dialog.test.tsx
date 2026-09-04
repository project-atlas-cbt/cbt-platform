import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { RevokeParticipantDialog } from './revoke-participant-dialog';

describe('RevokeParticipantDialog', () => {
  it('blocks submission client-side when the reason is empty', async () => {
    const onConfirm = vi.fn();
    render(
      <RevokeParticipantDialog
        open
        onOpenChange={vi.fn()}
        studentName="Tunde Bello"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /revoke access/i }));
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits the typed reason and closes on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <RevokeParticipantDialog
        open
        onOpenChange={onOpenChange}
        studentName="Tunde Bello"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'Wrong student activated.');
    await userEvent.click(screen.getByRole('button', { name: /revoke access/i }));
    expect(onConfirm).toHaveBeenCalledWith('Wrong student activated.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open and shows an inline error when the mutation rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ApiError({
        code: 'EXAM_SESSION_PARTICIPANT_NOT_AUTHORIZED',
        message: 'This participant is not currently authorized.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <RevokeParticipantDialog
        open
        onOpenChange={onOpenChange}
        studentName="Tunde Bello"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'A real reason.');
    await userEvent.click(screen.getByRole('button', { name: /revoke access/i }));
    expect(
      await screen.findByText('This participant is not currently authorized.'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
