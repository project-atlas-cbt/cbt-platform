import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimerDisplay } from './timer-display';

describe('TimerDisplay', () => {
  it('formats hours:minutes:seconds when an hour or more remains', () => {
    render(
      <TimerDisplay remainingMs={3_661_000} fiveMinuteWarning={false} oneMinuteWarning={false} />,
    );
    expect(screen.getByText('1:01:01')).toBeInTheDocument();
  });

  it('formats minutes:seconds under an hour', () => {
    render(
      <TimerDisplay remainingMs={65_000} fiveMinuteWarning={false} oneMinuteWarning={false} />,
    );
    expect(screen.getByText('01:05')).toBeInTheDocument();
  });

  it('bug fix — never renders "Infinity:NaN:NaN" for a non-finite remaining time', () => {
    // Reachable in practice for one real render pass: `useAttemptTimer`'s
    // state initializes to `Number.POSITIVE_INFINITY` and only corrects
    // once its own effect runs, which happens after the loading-skeleton
    // guard in `exam-runtime.tsx` has already cleared.
    render(
      <TimerDisplay
        remainingMs={Number.POSITIVE_INFINITY}
        fiveMinuteWarning={false}
        oneMinuteWarning={false}
      />,
    );
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/infinity/i)).not.toBeInTheDocument();
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });
});
