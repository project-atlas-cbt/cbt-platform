import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('explains why it is empty and offers a next action', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="No schools have been onboarded yet"
        description="Create your first school to get started."
        action={<button onClick={onAction}>Create school</button>}
      />,
    );

    expect(screen.getByText('No schools have been onboarded yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first school to get started.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create school' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders without a description or action', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
