import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExamLockedElsewhereScreen } from './exam-locked-elsewhere-screen';

describe('ExamLockedElsewhereScreen', () => {
  it('DoD 20 — offers "Use this tab instead" before a takeover is requested', () => {
    render(
      <ExamLockedElsewhereScreen
        onRequestTakeover={vi.fn()}
        onForceSwitch={vi.fn()}
        canForceSwitch={false}
        requested={false}
      />,
    );
    expect(screen.getByRole('button', { name: /use this tab instead/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /force switch/i })).not.toBeInTheDocument();
  });

  it('shows a waiting message once takeover has been requested', () => {
    render(
      <ExamLockedElsewhereScreen
        onRequestTakeover={vi.fn()}
        onForceSwitch={vi.fn()}
        canForceSwitch={false}
        requested
      />,
    );
    expect(screen.getByText(/waiting for your other tab/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use this tab instead/i })).not.toBeInTheDocument();
  });

  it('confirmed decision — offers "Force switch anyway" once the timeout has elapsed', () => {
    const onForceSwitch = vi.fn();
    render(
      <ExamLockedElsewhereScreen
        onRequestTakeover={vi.fn()}
        onForceSwitch={onForceSwitch}
        canForceSwitch
        requested
      />,
    );
    const button = screen.getByRole('button', { name: /force switch anyway/i });
    button.click();
    expect(onForceSwitch).toHaveBeenCalled();
  });
});
