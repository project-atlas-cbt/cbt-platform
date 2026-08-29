import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ImportProgress } from './import-progress';

describe('ImportProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows validating copy with no row counts', () => {
    render(<ImportProgress phase="validating" />);
    expect(screen.getByText('Validating your file…')).toBeInTheDocument();
    expect(screen.queryByText(/processed/i)).not.toBeInTheDocument();
  });

  it('shows importing copy with row counts from the job', () => {
    render(
      <ImportProgress
        phase="importing"
        job={{ validRows: 100, committedRows: 40, failedRows: 2 }}
      />,
    );
    expect(screen.getByText('Importing valid rows…')).toBeInTheDocument();
    expect(screen.getByText('42 of 100 processed')).toBeInTheDocument();
  });

  it('updates row counts between two polled snapshots (re-render with fresh job data)', () => {
    const { rerender } = render(
      <ImportProgress
        phase="importing"
        job={{ validRows: 100, committedRows: 10, failedRows: 0 }}
      />,
    );
    expect(screen.getByText('10 of 100 processed')).toBeInTheDocument();

    rerender(
      <ImportProgress
        phase="importing"
        job={{ validRows: 100, committedRows: 55, failedRows: 1 }}
      />,
    );
    expect(screen.getByText('56 of 100 processed')).toBeInTheDocument();
  });

  it('shows elapsed time, advancing over time (DoD item 8 reassurance)', () => {
    render(<ImportProgress phase="validating" />);
    expect(screen.getByText(/0s elapsed/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/5s elapsed/)).toBeInTheDocument();
  });
});
