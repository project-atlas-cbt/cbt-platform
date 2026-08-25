import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// jsdom pointer-capture/scrollIntoView polyfills for Radix live in
// vitest.setup.ts (shared across every Radix-based component's tests).

describe('Select', () => {
  it('shows the default value and selects a new option', async () => {
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="term-1" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Academic term">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="term-1">First Term</SelectItem>
          <SelectItem value="term-2">Second Term</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('First Term')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Academic term' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Second Term' }));
    expect(onValueChange).toHaveBeenCalledWith('term-2');
  });
});
