import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InvalidationDialog,
  MakeupGrantDialog,
  RetryAuthorizationDialog,
} from './attempt-administration-dialogs';

describe('F16 attempt-administration dialogs', () => {
  it('requires a reason before granting bulk makeup access', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<MakeupGrantDialog open onOpenChange={vi.fn()} studentCount={2} onConfirm={confirm} />);
    await userEvent.click(screen.getByRole('button', { name: /grant makeup access/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Reason'), 'Medical absence');
    await userEvent.click(screen.getByRole('button', { name: /grant makeup access/i }));
    expect(confirm).toHaveBeenCalledWith({ reason: 'Medical absence' });
  });

  it('distinguishes exceptional retry from makeup and makes invalidation destructive', () => {
    const { rerender } = render(
      <RetryAuthorizationDialog
        open
        onOpenChange={vi.fn()}
        studentName="Ada"
        sessionLabel="Original session"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/not makeup access/i)).toBeInTheDocument();
    rerender(
      <InvalidationDialog
        open
        onOpenChange={vi.fn()}
        studentName="Ada"
        sessionLabel="Original session"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/marked voided/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/access expires/i)).not.toBeInTheDocument();
  });

  it('rejects an expiry timestamp that has already passed', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<MakeupGrantDialog open onOpenChange={vi.fn()} studentCount={1} onConfirm={confirm} />);
    await userEvent.type(screen.getByLabelText('Reason'), 'Medical absence');
    fireEvent.change(screen.getByLabelText(/access expires/i), {
      target: { value: '2020-01-01T09:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: /grant makeup access/i }));
    expect(await screen.findByText(/expiry must be in the future/i)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
});
