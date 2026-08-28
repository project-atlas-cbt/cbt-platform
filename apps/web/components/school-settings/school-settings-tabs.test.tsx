import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchoolSettingsTabs } from './school-settings-tabs';
import { useSettingsDirty } from '@/lib/forms/settings-dirty-context';

const push = vi.fn();
let pathname = '/school/settings/profile';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/forms/settings-dirty-context', () => ({ useSettingsDirty: vi.fn() }));

describe('SchoolSettingsTabs', () => {
  beforeEach(() => {
    push.mockReset();
    pathname = '/school/settings/profile';
  });

  it('marks the active tab and links to every section', () => {
    vi.mocked(useSettingsDirty).mockReturnValue(false);
    render(<SchoolSettingsTabs />);
    const profileTab = screen.getByRole('link', { name: 'Profile' });
    expect(profileTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Branding' })).not.toHaveAttribute('aria-current');
    for (const label of ['Profile', 'Branding', 'Assessment Rules', 'Results', 'Subscription']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('navigates immediately when nothing is dirty', () => {
    vi.mocked(useSettingsDirty).mockReturnValue(false);
    render(<SchoolSettingsTabs />);
    fireEvent.click(screen.getByRole('link', { name: 'Branding' }));
    // Real <Link> navigation isn't intercepted — no confirmation dialog shown.
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });

  it('intercepts navigation behind a confirmation dialog when dirty', () => {
    vi.mocked(useSettingsDirty).mockReturnValue(true);
    render(<SchoolSettingsTabs />);
    fireEvent.click(screen.getByRole('link', { name: 'Branding' }));
    expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(push).toHaveBeenCalledWith('/school/settings/branding');
  });

  it('stays on the page when the dialog is cancelled', () => {
    vi.mocked(useSettingsDirty).mockReturnValue(true);
    render(<SchoolSettingsTabs />);
    fireEvent.click(screen.getByRole('link', { name: 'Results' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});
