import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReasonDialog } from './reason-dialog';

const onOpenChange = vi.fn();
const onConfirm = vi.fn();

describe('ReasonDialog', () => {
  beforeEach(() => {
    onOpenChange.mockReset();
    onConfirm.mockReset();
  });

  it('blocks submission with no reason and never calls onConfirm', async () => {
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Suspend this school?"
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with the typed reason and closes on success', async () => {
    onConfirm.mockResolvedValueOnce(undefined);
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Suspend this school?"
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'Non-payment');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Non-payment'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows an inline error and stays open when onConfirm rejects — never optimistic', async () => {
    onConfirm.mockRejectedValueOnce(new Error('boom'));
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Suspend this school?"
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), 'Non-payment');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be completed/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows the school-visible break-glass warning only for variant="breakGlass"', () => {
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Invalidate this attempt?"
        variant="breakGlass"
        confirmLabel="Invalidate"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/visible to the school admin/i)).toBeInTheDocument();
  });

  it('defaults to the platform-operations warning, not the break-glass one', () => {
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Suspend this school?"
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/recorded in the platform audit log/i)).toBeInTheDocument();
    expect(screen.queryByText(/visible to the school admin/i)).not.toBeInTheDocument();
  });

  it('cancel closes without calling onConfirm', async () => {
    render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Suspend this school?"
        confirmLabel="Suspend"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
