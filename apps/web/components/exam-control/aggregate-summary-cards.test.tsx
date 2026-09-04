import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AggregateSummaryCards } from './aggregate-summary-cards';

describe('AggregateSummaryCards', () => {
  it('renders real counts for authorized/not-started/absent', () => {
    render(
      <AggregateSummaryCards
        aggregate={{
          authorizedCount: 40,
          notStartedCount: 40,
          inProgressCount: 0,
          submittedCount: 0,
          absentCount: 0,
          attemptDataAvailable: false,
        }}
      />,
    );
    expect(screen.getAllByText('40')).toHaveLength(2);
  });

  it('renders — (never a fabricated 0) for in-progress/submitted while attemptDataAvailable is false', () => {
    render(
      <AggregateSummaryCards
        aggregate={{
          authorizedCount: 40,
          notStartedCount: 40,
          inProgressCount: 0,
          submittedCount: 0,
          absentCount: 0,
          attemptDataAvailable: false,
        }}
      />,
    );
    expect(screen.getAllByText('—')).toHaveLength(2);
    // "In progress"/"Submitted" specifically never show a fabricated 0 —
    // "Absent" showing a real 0 (asserted in its own test below) is fine.
    expect(screen.getByText('In progress').nextSibling).toHaveTextContent('—');
    expect(screen.getByText('Submitted').nextSibling).toHaveTextContent('—');
  });

  it('renders a real 0/number for in-progress/submitted once attemptDataAvailable is true', () => {
    render(
      <AggregateSummaryCards
        aggregate={{
          authorizedCount: 40,
          notStartedCount: 10,
          inProgressCount: 25,
          submittedCount: 5,
          absentCount: 0,
          attemptDataAvailable: true,
        }}
      />,
    );
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('genuinely renders a real 0 for absent — never treated as a placeholder', () => {
    render(
      <AggregateSummaryCards
        aggregate={{
          authorizedCount: 40,
          notStartedCount: 40,
          inProgressCount: 0,
          submittedCount: 0,
          absentCount: 0,
          attemptDataAvailable: false,
        }}
      />,
    );
    expect(screen.getByText('Absent').nextSibling).toHaveTextContent('0');
  });
});
