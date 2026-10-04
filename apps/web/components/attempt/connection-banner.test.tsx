import { describe, expect, it, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ConnectionBanner } from './connection-banner';
import { connectivityStore } from '@/lib/attempt/connectivity-store';

describe('ConnectionBanner', () => {
  afterEach(() => {
    connectivityStore.reportSuccess();
  });

  it('shows nothing while online, but keeps its live region mounted (F20, DoD 2)', () => {
    connectivityStore.reportSuccess();
    render(<ConnectionBanner />);
    // An always-present, empty region is what lets a screen reader announce
    // the offline message when it appears.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces in place when connectivity drops after mount', async () => {
    connectivityStore.reportSuccess();
    render(<ConnectionBanner />);
    const region = screen.getByRole('status');
    act(() => {
      connectivityStore.reportFailure();
    });
    expect(await screen.findByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(region);
  });

  it('DoD 7 — shows the offline banner once connectivity is reported lost', () => {
    connectivityStore.reportFailure();
    render(<ConnectionBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/you're offline/i);
  });
});
