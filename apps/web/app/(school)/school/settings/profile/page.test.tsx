import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolProfileSettingsPage from './page';
import { useSchoolProfile } from '@/lib/school-settings/queries';
import { useUpdateSchoolProfile } from '@/lib/school-settings/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/school-settings/queries', () => ({ useSchoolProfile: vi.fn() }));
vi.mock('@/lib/school-settings/mutations', () => ({ useUpdateSchoolProfile: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/forms/settings-dirty-context', () => ({ useRegisterFormDirty: vi.fn() }));

const mockUseSchoolProfile = vi.mocked(useSchoolProfile);
const mockUseUpdateSchoolProfile = vi.mocked(useUpdateSchoolProfile);
const mockUseHasPermission = vi.mocked(useHasPermission);

const PROFILE = {
  id: 's1',
  name: 'Greenfield Academy',
  subdomain: 'greenfield',
  timezone: 'Africa/Lagos',
  shortName: 'Greenfield',
  contactEmail: 'admin@greenfield.example',
  contactPhone: '+2340000000',
  address: '1 School Rd',
};

describe('SchoolProfileSettingsPage', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseUpdateSchoolProfile.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while the profile is loading', () => {
    mockUseSchoolProfile.mockReturnValue({ isPending: true, isError: false } as never);
    render(<SchoolProfileSettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseSchoolProfile.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<SchoolProfileSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the real profile fields, editable', async () => {
    mockUseSchoolProfile.mockReturnValue({
      isPending: false,
      isError: false,
      data: PROFILE,
    } as never);
    mutateAsync.mockResolvedValueOnce(PROFILE);
    render(<SchoolProfileSettingsPage />);

    expect(screen.getByDisplayValue('Greenfield Academy')).toBeInTheDocument();
    expect(screen.getByText('greenfield')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/school name/i));
    await userEvent.type(screen.getByLabelText(/school name/i), 'Renamed Academy');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Academy' }));
  });

  it('disables editing and hides the save button for a view-only actor (Moderator)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseSchoolProfile.mockReturnValue({
      isPending: false,
      isError: false,
      data: PROFILE,
    } as never);
    render(<SchoolProfileSettingsPage />);

    expect(screen.getByLabelText(/school name/i)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
