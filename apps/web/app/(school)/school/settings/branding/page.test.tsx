import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolBrandingSettingsPage from './page';
import { useSchoolBranding } from '@/lib/school-settings/queries';
import { useUpdateBranding } from '@/lib/branding/mutations';
import { useLogoUpload } from '@/lib/branding/use-logo-upload';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/school-settings/queries', () => ({ useSchoolBranding: vi.fn() }));
vi.mock('@/lib/branding/mutations', () => ({ useUpdateBranding: vi.fn() }));
vi.mock('@/lib/branding/use-logo-upload', () => ({ useLogoUpload: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/forms/settings-dirty-context', () => ({ useRegisterFormDirty: vi.fn() }));

const mockUseSchoolBranding = vi.mocked(useSchoolBranding);
const mockUseUpdateBranding = vi.mocked(useUpdateBranding);
const mockUseLogoUpload = vi.mocked(useLogoUpload);
const mockUseHasPermission = vi.mocked(useHasPermission);

describe('SchoolBrandingSettingsPage', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseUpdateBranding.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockUseLogoUpload.mockReturnValue({ upload: vi.fn(), uploading: false, error: null });
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while branding is loading', () => {
    mockUseSchoolBranding.mockReturnValue({ isPending: true, isError: false } as never);
    render(<SchoolBrandingSettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseSchoolBranding.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<SchoolBrandingSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the preview and saves a valid colour', async () => {
    mockUseSchoolBranding.mockReturnValue({
      isPending: false,
      isError: false,
      data: { logoUrl: null, primaryColor: null, palette: null },
    } as never);
    mutateAsync.mockResolvedValueOnce({});
    render(<SchoolBrandingSettingsPage />);

    expect(screen.getByText('Preview School Theme')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('#0057B8'), '#2563EB');
    await userEvent.click(screen.getByRole('button', { name: /save branding/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ primaryColor: '#2563EB' });
  });

  it('disables editing for a view-only actor (Moderator)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseSchoolBranding.mockReturnValue({
      isPending: false,
      isError: false,
      data: { logoUrl: null, primaryColor: '#111111', palette: null },
    } as never);
    render(<SchoolBrandingSettingsPage />);

    expect(screen.getByLabelText('Pick primary colour')).toBeDisabled();
    expect(screen.getByLabelText('School logo')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save branding/i })).not.toBeInTheDocument();
  });
});
