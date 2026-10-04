import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './error-state';
import { ApiError, NetworkError } from '@/lib/api/error';

describe('ErrorState', () => {
  it('is announced as an alert and shows the error message', () => {
    render(<ErrorState error={new Error('Could not load results.')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load results.');
  });

  it('offers a retry action for a retryable ApiError and calls onRetry', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        error={
          new ApiError({ code: 'X', message: 'Try again', retryable: true, correlationId: 'abc' })
        }
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/abc/)).toBeInTheDocument();
  });

  it('does not offer a retry action for a non-retryable ApiError', () => {
    render(
      <ErrorState
        error={
          new ApiError({
            code: 'X',
            message: 'Not allowed',
            retryable: false,
            correlationId: 'abc',
          })
        }
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('treats a NetworkError as retryable', () => {
    render(<ErrorState error={new NetworkError()} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('forceRetryable shows the action even for a non-retryable error', () => {
    render(
      <ErrorState
        error={
          new ApiError({
            code: 'X',
            message: 'Not allowed',
            retryable: false,
            correlationId: 'abc',
          })
        }
        onRetry={vi.fn()}
        forceRetryable
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows load shedding as a calm status, with retry held until Retry-After passes (F20/B21)', () => {
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn();
      render(
        <ErrorState
          error={
            new ApiError({
              code: 'SERVICE_UNAVAILABLE',
              message: 'This is temporarily unavailable while examinations are under heavy load.',
              retryable: true,
              correlationId: 'c1',
              httpStatus: 503,
              retryAfterMs: 3000,
            })
          }
          onRetry={onRetry}
        />,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Temporarily unavailable');
      const button = screen.getByRole('button', { name: /Try again in 3 s/ });
      expect(button).toBeDisabled();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
