import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders an accessible loading status', () => {
    render(<Skeleton className="h-4 w-32" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
