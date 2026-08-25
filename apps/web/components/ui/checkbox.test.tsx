import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';
import { Label } from './label';

describe('Checkbox', () => {
  it('toggles checked state via label click and reports it', async () => {
    const onCheckedChange = vi.fn();
    render(
      <>
        <Checkbox id="notify" onCheckedChange={onCheckedChange} />
        <Label htmlFor="notify">Notify me</Label>
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Notify me' });
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');

    await userEvent.click(screen.getByText('Notify me'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders a disabled state', () => {
    render(<Checkbox disabled aria-label="disabled checkbox" />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
