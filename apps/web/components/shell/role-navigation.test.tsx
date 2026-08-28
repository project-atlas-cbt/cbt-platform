import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Role } from '@atlas/domain';
import { RoleNavigation } from './role-navigation';
import { ROLE_WORKSPACES, type NavItem } from '@/lib/nav/nav-model';
import type { NavigationResult } from '@/lib/nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/teacher' }));

/**
 * Purely presentational since the F3-mirroring props refactor (fixing the
 * bug where this component fetched the school-only `/me/permissions`
 * unconditionally, including under the platform shell) — these tests build
 * `NavigationResult` values directly rather than mocking `apiClient`; the
 * fetching/filtering logic itself is `useNavigation`/`usePlatformNavigation`'s
 * own responsibility, covered by `use-navigation.test.tsx`.
 */
function allItems(role: Role): readonly NavItem[] {
  return ROLE_WORKSPACES[role].items;
}

function renderNav(role: Role, navigation: NavigationResult) {
  return render(<RoleNavigation role={role} navigation={navigation} />);
}

describe('RoleNavigation', () => {
  it.each(Object.keys(ROLE_WORKSPACES) as Role[])(
    '%s: renders exactly the items its NavigationResult provides',
    (role) => {
      const items = allItems(role);
      renderNav(role, { items, isLoading: false, isError: false });

      for (const item of items) {
        expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
      }
      expect(screen.getAllByRole('link')).toHaveLength(items.length);
    },
  );

  it('links to the workspace root for the home item and a subpath for the rest', () => {
    renderNav('TEACHER', { items: allItems('TEACHER'), isLoading: false, isError: false });

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/teacher');
    expect(screen.getByRole('link', { name: 'Question Bank' })).toHaveAttribute(
      'href',
      '/teacher/question-bank',
    );
  });

  it('marks the current route as the active nav item', () => {
    renderNav('TEACHER', { items: allItems('TEACHER'), isLoading: false, isError: false });

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Exams' })).not.toHaveAttribute('aria-current');
  });

  it('shows a loading skeleton, not an empty sidebar, while items is null', () => {
    renderNav('TEACHER', { items: null, isLoading: true, isError: false });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Workspace navigation')).toBeInTheDocument();
  });
});
