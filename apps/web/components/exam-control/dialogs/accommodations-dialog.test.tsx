import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccommodationsDialog } from './accommodations-dialog';

// Typing-heavy userEvent flows: the 2026-09-25 suite repair's ceiling for
// tests that run slowly under full-suite CPU contention.
describe('AccommodationsDialog (F20, DoD 3)', { timeout: 15_000 }, () => {
  it('saves extra minutes as seconds and the larger-text choice', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <AccommodationsDialog
        open
        onOpenChange={onOpenChange}
        studentName="Ada Obi"
        initial={{ extraTimeSeconds: 0, largerText: false }}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();
    const minutes = screen.getByLabelText(/extra time \(minutes\)/i);
    await user.clear(minutes);
    await user.type(minutes, '15');
    await user.click(screen.getByLabelText(/larger text in the exam/i));
    await user.click(screen.getByRole('button', { name: /save accommodations/i }));

    expect(onConfirm).toHaveBeenCalledWith({ extraTimeSeconds: 900, largerText: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('refuses an invalid number of minutes, with the reason tied to the field', async () => {
    render(
      <AccommodationsDialog
        open
        onOpenChange={vi.fn()}
        studentName="Ada Obi"
        initial={{ extraTimeSeconds: 600, largerText: true }}
        onConfirm={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const minutes = screen.getByLabelText(/extra time \(minutes\)/i);
    expect(minutes).toHaveValue('10');
    await user.clear(minutes);
    await user.type(minutes, '-5');
    expect(minutes).toHaveAttribute('aria-invalid', 'true');
    expect(minutes).toHaveAccessibleDescription(/whole number of minutes/i);
    expect(screen.getByRole('button', { name: /save accommodations/i })).toBeDisabled();
  });

  it('shows a server failure and stays open', async () => {
    const onOpenChange = vi.fn();
    render(
      <AccommodationsDialog
        open
        onOpenChange={onOpenChange}
        studentName="Ada Obi"
        initial={{ extraTimeSeconds: 0, largerText: false }}
        onConfirm={vi.fn().mockRejectedValue(new Error('Server said no'))}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /save accommodations/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
