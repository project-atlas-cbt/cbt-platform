import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeopleTabs } from './people-tabs';
import { useHasPermission } from '@/lib/nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/school/people/students' }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseHasPermission = vi.mocked(useHasPermission);

describe('PeopleTabs', () => {
  it('shows all four sections including Moderators for a School Admin', () => {
    mockUseHasPermission.mockReturnValue(true);
    render(<PeopleTabs basePath="/school/people" />);
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Teachers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'HODs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Moderators' })).toHaveAttribute(
      'href',
      '/school/people/moderators',
    );
  });

  it('hides the Moderators tab for a Moderator viewer (05 §14 — School Admin only)', () => {
    mockUseHasPermission.mockReturnValue(false);
    render(<PeopleTabs basePath="/moderator/people" />);
    expect(screen.queryByRole('link', { name: 'Moderators' })).not.toBeInTheDocument();
  });
});
