import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvalidatedScreen } from './invalidated-screen';

describe('InvalidatedScreen', () => {
  it('DoD 17 — shows the given reason', () => {
    render(<InvalidatedScreen invalidationReason="Suspected integrity violation." />);
    expect(screen.getByText('Suspected integrity violation.')).toBeInTheDocument();
  });

  it('falls back to an honest generic message when no reason is available', () => {
    render(<InvalidatedScreen invalidationReason={null} />);
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
  });
});
