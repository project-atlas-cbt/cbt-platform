import { describe, expect, it, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionBanner } from './connection-banner';
import { connectivityStore } from '@/lib/attempt/connectivity-store';

describe('ConnectionBanner', () => {
  afterEach(() => {
    connectivityStore.reportSuccess();
  });

  it('renders nothing while online', () => {
    connectivityStore.reportSuccess();
    render(<ConnectionBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('DoD 7 — shows the offline banner once connectivity is reported lost', () => {
    connectivityStore.reportFailure();
    render(<ConnectionBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/you're offline/i);
  });
});
