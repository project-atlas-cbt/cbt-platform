import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileMenu } from './profile-menu';

const onLogout = vi.fn();
const IDENTITY = { displayName: 'Ada B', secondaryLabel: 'T042' };

describe('ProfileMenu', () => {
  beforeEach(() => {
    onLogout.mockReset();
  });

  it('renders nothing before the session bootstrap resolves', () => {
    const { container } = render(<ProfileMenu identity={null} onLogout={onLogout} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the signed-in identity’s name and secondary label', async () => {
    render(<ProfileMenu identity={IDENTITY} onLogout={onLogout} />);
    expect(screen.getByText('Ada B')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('T042')).toBeInTheDocument();
  });

  it('calls the provided onLogout when Sign out is selected — redirect target is the caller’s job', async () => {
    onLogout.mockResolvedValueOnce(undefined);
    render(<ProfileMenu identity={IDENTITY} onLogout={onLogout} />);
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
