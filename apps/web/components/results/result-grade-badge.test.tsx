import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultCorrectnessBadge, ResultGradeBadge } from './result-grade-badge';

describe('ResultGradeBadge', () => {
  it('renders the grade letter', () => {
    render(<ResultGradeBadge grade="A" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders "Ungraded" when the school has no grading scale (ADR-0018)', () => {
    render(<ResultGradeBadge grade={null} />);
    expect(screen.getByText('Ungraded')).toBeInTheDocument();
  });
});

describe('ResultCorrectnessBadge', () => {
  it.each([
    ['CORRECT', 'Correct'],
    ['INCORRECT', 'Incorrect'],
    ['UNANSWERED', 'Unanswered'],
    ['PARTIAL', 'Partial'],
  ])('renders a readable label for %s', (value, label) => {
    render(<ResultCorrectnessBadge value={value} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
