import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeratorsScreen } from './moderators-screen';
import { useModeratorsPaginated } from '@/lib/people/queries';
import { useRemoveModerator } from '@/lib/people/mutations';
import { useHasPermission } from '@/lib/nav';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/people/queries', () => ({ useModeratorsPaginated: vi.fn() }));
vi.mock('@/lib/people/mutations', () => ({ useRemoveModerator: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseModeratorsPaginated = vi.mocked(useModeratorsPaginated);
const mockUseRemoveModerator = vi.mocked(useRemoveModerator);
const mockUseHasPermission = vi.mocked(useHasPermission);

const MODERATORS = [
  {
    membershipId: 'm1',
    firstName: 'Mod',
    lastName: 'Erator',
    displayName: 'Mod Erator',
    loginIdentifier: 'mod01',
    email: 'mod@example.com',
    userStatus: 'ACTIVE',
  },
];

describe('ModeratorsScreen', () => {
  beforeEach(() => {
    replace.mockReset();
    params = new URLSearchParams();
    mockUseModeratorsPaginated.mockReset();
    mockUseRemoveModerator.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('renders moderator rows for a School Admin viewer', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseModeratorsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { moderators: MODERATORS, total: 1, page: 1, pageSize: 25 },
      refetch: vi.fn(),
    } as never);
    render(<ModeratorsScreen basePath="/school/people" />);
    expect(screen.getByText('Mod Erator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add moderator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actions for mod erator/i })).toBeInTheDocument();
  });

  it('05 §14 — a Moderator viewer sees no create/edit/remove controls (Moderator cannot manage Moderators)', () => {
    mockUseHasPermission.mockReturnValue(false); // users.moderator.create denied to MODERATOR
    mockUseModeratorsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { moderators: MODERATORS, total: 1, page: 1, pageSize: 25 },
      refetch: vi.fn(),
    } as never);
    render(<ModeratorsScreen basePath="/moderator/people" />);
    expect(screen.queryByRole('button', { name: /add moderator/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /actions for mod erator/i }),
    ).not.toBeInTheDocument();
    // The row itself is still visible — this screen is unreachable for
    // MODERATOR in practice (users.moderator.view is also denied, and
    // PeopleTabs hides the tab), but every control is defensively gated too.
    expect(screen.getByText('Mod Erator')).toBeInTheDocument();
  });

  it('shows the first-run empty state', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseModeratorsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { moderators: [], total: 0, page: 1, pageSize: 25 },
      refetch: vi.fn(),
    } as never);
    render(<ModeratorsScreen basePath="/school/people" />);
    expect(screen.getByText('No moderators yet')).toBeInTheDocument();
  });
});
