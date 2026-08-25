import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './error-boundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('contains a render failure and shows a retry-capable fallback, calling onError', () => {
    const onError = vi.fn();
    // React logs the caught error to the console by default; silence it
    // for this expected-failure test only.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary onError={onError}>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent("This section couldn't be displayed");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('resets and re-renders children after "Try again"', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('boom');
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
