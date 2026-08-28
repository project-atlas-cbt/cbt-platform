import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step02Branding } from './step-02-branding';
import { useSchoolBranding } from '@/lib/onboarding/queries';
import { useUpdateBranding } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useSchoolBranding: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({
  useRequestLogoUpload: () => ({ mutateAsync: vi.fn() }),
  useCompleteLogoUpload: () => ({ mutateAsync: vi.fn() }),
  useUpdateBranding: vi.fn(),
}));

describe('Step02Branding', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useUpdateBranding).mockReturnValue({ mutateAsync, isPending: false } as never);
  });

  it('shows a loading skeleton while branding is loading', () => {
    vi.mocked(useSchoolBranding).mockReturnValue({ data: undefined, isPending: true } as never);
    render(<Step02Branding />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the Preview School Theme section with all six contexts', () => {
    vi.mocked(useSchoolBranding).mockReturnValue({
      data: { logoUrl: null, primaryColor: null },
      isPending: false,
    } as never);
    render(<Step02Branding />);
    expect(screen.getByText('Preview School Theme')).toBeInTheDocument();
    for (const label of [
      'Login',
      'Dashboard',
      'Exam interface',
      'Buttons',
      'Tables',
      'Result pages',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('rejects a malformed colour before saving', async () => {
    vi.mocked(useSchoolBranding).mockReturnValue({
      data: { logoUrl: null, primaryColor: null },
      isPending: false,
    } as never);
    render(<Step02Branding />);
    await userEvent.type(screen.getByPlaceholderText('#0057B8'), 'not-a-colour');
    await userEvent.click(screen.getByRole('button', { name: /save branding/i }));
    expect(await screen.findByText(/enter a colour as #rrggbb/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('saves a valid colour', async () => {
    vi.mocked(useSchoolBranding).mockReturnValue({
      data: { logoUrl: null, primaryColor: null },
      isPending: false,
    } as never);
    render(<Step02Branding />);
    await userEvent.type(screen.getByPlaceholderText('#0057B8'), '#1D4ED8');
    await userEvent.click(screen.getByRole('button', { name: /save branding/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ primaryColor: '#1D4ED8' });
  });
});
