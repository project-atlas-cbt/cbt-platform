import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/error-state';
import { reportClientError } from '@/lib/observability/client-errors';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; defaults to <ErrorState>. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Doctrine §7: "Never block the whole screen for a partial data failure —
 * degrade the specific section." This is the primitive that makes that
 * possible — wrap a section (a dashboard card, a table) rather than the
 * whole page, so one failing panel doesn't blank an entire screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // F20 (DoD 11): every caught section failure is reported (scrubbed).
    reportClientError(error, { source: 'error-boundary' });
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }
    return (
      <ErrorState
        error={error}
        onRetry={this.reset}
        title="This section couldn't be displayed"
        forceRetryable
      />
    );
  }
}
