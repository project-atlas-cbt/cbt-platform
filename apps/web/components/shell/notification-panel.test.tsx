import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPanel } from './notification-panel';

describe('NotificationPanel', () => {
  it('shows an honest "not yet available" empty state — never a fabricated notification', async () => {
    render(<NotificationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByText(/B10/)).toBeInTheDocument();
  });
});
