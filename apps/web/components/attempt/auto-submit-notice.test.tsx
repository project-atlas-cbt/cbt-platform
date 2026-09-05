import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutoSubmitNotice } from './auto-submit-notice';

describe('AutoSubmitNotice', () => {
  it('DoD 15 — states the answers were submitted automatically, with no action to click', () => {
    render(<AutoSubmitNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(/submitted automatically/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
