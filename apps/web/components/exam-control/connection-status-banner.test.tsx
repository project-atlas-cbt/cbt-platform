import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatusBanner } from './connection-status-banner';

describe('ConnectionStatusBanner', () => {
  it('renders nothing while connecting', () => {
    const { container } = render(<ConnectionStatusBanner status="connecting" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while live', () => {
    const { container } = render(<ConnectionStatusBanner status="live" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a non-blocking reconnecting banner (status role, not alert) while reconnecting', () => {
    render(<ConnectionStatusBanner status="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent(/reconnecting/i);
  });

  it('shows a persistent alert when the connection is permanently closed', () => {
    render(<ConnectionStatusBanner status="closed-permanent" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/connection lost/i);
  });
});
