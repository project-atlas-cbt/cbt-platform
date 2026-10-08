import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptionList } from './option-list';

const OPTIONS = [
  { optionId: 'o1', content: '<p>Lagos</p>', displayPosition: 1 },
  { optionId: 'o2', content: '<p>Abuja</p>', displayPosition: 2 },
];

describe('OptionList', () => {
  it('pilot feedback — a click anywhere in the option box selects it, not only the circle or text', async () => {
    const onSelect = vi.fn();
    render(<OptionList attemptId="a1" examQuestionId="q1" options={OPTIONS} onSelect={onSelect} />);
    const radio = screen.getByRole('radio', { name: 'Abuja' });
    const box = radio.closest('label');
    expect(box).not.toBeNull();

    await userEvent.setup().click(box!);
    expect(onSelect).toHaveBeenCalledWith('o2');
  });
});
