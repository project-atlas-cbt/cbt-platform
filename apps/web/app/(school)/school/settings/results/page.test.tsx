import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolResultsSettingsPage from './page';
import { useResultPolicy } from '@/lib/school-settings/queries';
import { useUpdateResultPolicy } from '@/lib/school-settings/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/school-settings/queries', () => ({ useResultPolicy: vi.fn() }));
vi.mock('@/lib/school-settings/mutations', () => ({ useUpdateResultPolicy: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/forms/settings-dirty-context', () => ({ useRegisterFormDirty: vi.fn() }));

const mockUseResultPolicy = vi.mocked(useResultPolicy);
const mockUseUpdateResultPolicy = vi.mocked(useUpdateResultPolicy);
const mockUseHasPermission = vi.mocked(useHasPermission);

const DEFAULTS = {
  resultPolicy: 'SCHOOL_ADMIN',
  resultDetailVisibility: 'SCORE_AND_COUNTS',
  resultPolicyLocked: false,
};

describe('SchoolResultsSettingsPage', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseUpdateResultPolicy.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while loading', () => {
    mockUseResultPolicy.mockReturnValue({ isPending: true, isError: false } as never);
    render(<SchoolResultsSettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseResultPolicy.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<SchoolResultsSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the school defaults and the Grading Scale placeholder', () => {
    mockUseResultPolicy.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEFAULTS,
    } as never);
    render(<SchoolResultsSettingsPage />);
    expect(screen.getAllByText('School Admin publishes').length).toBeGreaterThan(0);
    expect(screen.getByText(/waits on b15/i)).toBeInTheDocument();
  });

  it('toggles the lock checkbox and saves', async () => {
    mockUseResultPolicy.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEFAULTS,
    } as never);
    mutateAsync.mockResolvedValueOnce(DEFAULTS);
    render(<SchoolResultsSettingsPage />);

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save result policy/i }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ resultPolicyLocked: true }));
  });

  it('hides editing for a view-only actor (Moderator)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseResultPolicy.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEFAULTS,
    } as never);
    render(<SchoolResultsSettingsPage />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save result policy/i })).not.toBeInTheDocument();
  });
});
