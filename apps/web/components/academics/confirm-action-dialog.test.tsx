import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { ApiError } from '@/lib/api';

const onOpenChange = vi.fn();
const onConfirm = vi.fn();

describe('ConfirmActionDialog', () => {
  beforeEach(() => {
    onOpenChange.mockReset();
    onConfirm.mockReset();
  });

  it('calls onConfirm and closes on success — no reason field, unlike ReasonDialog', async () => {
    onConfirm.mockResolvedValueOnce(undefined);
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this session?"
        confirmLabel="Archive"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('renders the ACADEMIC_STRUCTURE_HAS_DEPENDENTS breakdown, not a raw error, and stays open', async () => {
    onConfirm.mockRejectedValueOnce(
      new ApiError({
        code: 'ACADEMIC_STRUCTURE_HAS_DEPENDENTS',
        message: 'Cannot delete this department: it is still referenced by 2 class, 1 subject.',
        retryable: false,
        correlationId: 'c1',
        details: { entityType: 'department', dependents: { class: 2, subject: 1 } },
      }),
    );
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title='Delete "Sciences"?'
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/still referenced by 2 class, 1 subject/i);
    expect(alert).toHaveTextContent('2 classes');
    expect(alert).toHaveTextContent('1 subject');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows a plain error message for any other ApiError', async () => {
    onConfirm.mockRejectedValueOnce(
      new ApiError({
        code: 'ACADEMIC_ACTIVATION_CONFLICT',
        message: 'Another activation is in progress for this school — please retry.',
        retryable: true,
        correlationId: 'c2',
      }),
    );
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Set as current session?"
        confirmLabel="Set as current"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set as current' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/please retry/i);
  });

  it('cancel closes without calling onConfirm', async () => {
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this session?"
        confirmLabel="Archive"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders body context when provided', () => {
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this session?"
        body="This preserves all historical records."
        confirmLabel="Archive"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('This preserves all historical records.')).toBeInTheDocument();
  });
});
