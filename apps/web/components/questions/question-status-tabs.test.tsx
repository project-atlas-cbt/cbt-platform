import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionStatusTabs } from './question-status-tabs';

const COUNTS = {
  draft: 3,
  submitted: 2,
  underReview: 1,
  approved: 5,
  rejected: 0,
  archived: 0,
};

describe('QuestionStatusTabs', () => {
  it('renders every status including Under Review, with its real count', () => {
    render(<QuestionStatusTabs active={undefined} onChange={vi.fn()} counts={COUNTS} />);
    expect(screen.getByRole('tab', { name: /under review/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /draft.*3/i })).toBeInTheDocument();
  });

  it('marks the active tab selected', () => {
    render(<QuestionStatusTabs active="DRAFT" onChange={vi.fn()} counts={COUNTS} />);
    expect(screen.getByRole('tab', { name: /draft/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^all$/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the clicked status', async () => {
    const onChange = vi.fn();
    render(<QuestionStatusTabs active={undefined} onChange={onChange} counts={COUNTS} />);
    await userEvent.click(screen.getByRole('tab', { name: /rejected/i }));
    expect(onChange).toHaveBeenCalledWith('REJECTED');
  });

  it('calls onChange with undefined for "All"', async () => {
    const onChange = vi.fn();
    render(<QuestionStatusTabs active="DRAFT" onChange={onChange} counts={COUNTS} />);
    await userEvent.click(screen.getByRole('tab', { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
