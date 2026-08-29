import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionStatusBadge } from './question-status-badge';

describe('QuestionStatusBadge', () => {
  it.each([
    ['DRAFT', 'Draft'],
    ['SUBMITTED', 'Submitted'],
    ['UNDER_REVIEW', 'Under review'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
    ['ARCHIVED', 'Archived'],
  ])('renders %s as "%s"', (value, label) => {
    render(<QuestionStatusBadge value={value} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
