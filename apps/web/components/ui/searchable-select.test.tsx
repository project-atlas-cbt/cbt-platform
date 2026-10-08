import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect, type SearchableSelectOption } from './searchable-select';

const OPTIONS: SearchableSelectOption[] = [
  { value: '1', label: 'JSS1A' },
  { value: '2', label: 'JSS2A' },
  { value: '3', label: 'SS1A', hint: 'Sciences' },
  { value: '4', label: 'Ada Obi', hint: 'ST001', keywords: 'adaobi' },
];

function Harness({ onChange = vi.fn(), clearable = false }) {
  const [value, setValue] = useState<string | undefined>();
  return (
    <>
      <label htmlFor="pick">Class</label>
      <SearchableSelect
        id="pick"
        options={OPTIONS}
        value={value}
        clearable={clearable}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

describe('SearchableSelect', () => {
  it('lists labels starting with the query first, then other matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Class' }), 'ss');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'SS1ASciences',
      'JSS1A',
      'JSS2A',
    ]);
  });

  it('searches the hint and hidden keywords too', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox'), 'st001');
    expect(screen.getByRole('option', { name: /Ada Obi/ })).toBeInTheDocument();
  });

  it('picks with the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'jss');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('2');
    expect(box).toHaveValue('JSS2A');
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('reverts typed text that was never picked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('combobox');
    await user.click(box);
    await user.click(screen.getByRole('option', { name: 'JSS1A' }));
    await user.clear(box);
    await user.type(box, 'nothing');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(box).toHaveValue('JSS1A');
  });

  it('shows an empty message and can clear a selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} clearable />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'zzz');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
    await user.clear(box);
    await user.click(screen.getByRole('option', { name: 'JSS1A' }));
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(box).toHaveValue('');
  });
});
