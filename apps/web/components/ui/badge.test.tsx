import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders every status variant with visible text (not colour-only)', () => {
    const statuses = ['neutral', 'success', 'warning', 'danger', 'info'] as const;
    for (const status of statuses) {
      render(<Badge status={status}>{status}</Badge>);
    }
    for (const status of statuses) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });
});
