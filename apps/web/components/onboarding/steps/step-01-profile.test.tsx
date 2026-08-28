import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step01Profile } from './step-01-profile';
import { useSchoolProfile } from '@/lib/onboarding/queries';
import { useUpdateSchoolProfile } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useSchoolProfile: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useUpdateSchoolProfile: vi.fn() }));

describe('Step01Profile', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useUpdateSchoolProfile).mockReturnValue({ mutateAsync, isPending: false } as never);
  });

  it('shows a loading skeleton while the profile is loading', () => {
    vi.mocked(useSchoolProfile).mockReturnValue({ data: undefined, isPending: true } as never);
    render(<Step01Profile />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('pre-fills the form from the existing profile', () => {
    vi.mocked(useSchoolProfile).mockReturnValue({
      data: { shortName: 'GHS', contactEmail: 'a@b.com', contactPhone: null, address: null },
      isPending: false,
    } as never);
    render(<Step01Profile />);
    expect(screen.getByLabelText(/short name/i)).toHaveValue('GHS');
    expect(screen.getByLabelText(/contact email/i)).toHaveValue('a@b.com');
  });

  it('submits only the filled fields', async () => {
    vi.mocked(useSchoolProfile).mockReturnValue({
      data: { shortName: null, contactEmail: null, contactPhone: null, address: null },
      isPending: false,
    } as never);
    render(<Step01Profile />);
    await userEvent.type(screen.getByLabelText(/short name/i), 'Greenfield');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ shortName: 'Greenfield' });
  });

  it('rejects an invalid contact email', async () => {
    vi.mocked(useSchoolProfile).mockReturnValue({
      data: { shortName: null, contactEmail: null, contactPhone: null, address: null },
      isPending: false,
    } as never);
    render(<Step01Profile />);
    await userEvent.type(screen.getByLabelText(/contact email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
