import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FocusGuard } from './focus-guard';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('FocusGuard', () => {
  it('warns once when the student returns after leaving the window', () => {
    render(<FocusGuard enabled />);
    expect(screen.queryByText('You left the assessment window')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('blur'));
      setHidden(true);
    });
    act(() => {
      setHidden(false);
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.getByText('You left the assessment window')).toBeTruthy();
    expect(screen.queryByText(/times so far/)).toBeNull();
  });

  it('does nothing while disabled', () => {
    render(<FocusGuard enabled={false} />);
    act(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.queryByText('You left the assessment window')).toBeNull();
  });
});
