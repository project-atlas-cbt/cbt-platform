import { describe, expect, it, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineIndicator } from './offline-indicator';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('OfflineIndicator', () => {
  afterEach(() => {
    setOnline(true);
  });

  it('renders nothing while online', () => {
    setOnline(true);
    const { container } = render(<OfflineIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a persistent status banner once the browser goes offline, and clears it when back online', () => {
    setOnline(true);
    render(<OfflineIndicator />);

    act(() => setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);

    act(() => setOnline(true));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
