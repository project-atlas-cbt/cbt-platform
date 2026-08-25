import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('accepts typed input', async () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" />
      </>,
    );
    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'Ada');
    expect(input).toHaveValue('Ada');
  });

  it('renders a disabled state', () => {
    render(<Input disabled placeholder="disabled" />);
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled();
  });

  it('renders an invalid (error) state with aria-invalid', () => {
    render(<Input aria-invalid placeholder="invalid" />);
    expect(screen.getByPlaceholderText('invalid')).toHaveAttribute('aria-invalid', 'true');
  });
});
