import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Role } from '@atlas/domain';
import { RoleNavigation } from './role-navigation';
import { ROLE_WORKSPACES } from '@/lib/nav/nav-model';
import { apiClient } from '@/lib/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/teacher' }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);

function okResponse<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

/**
 * Every `match` prefix declared anywhere in the nav model, each turned into
 * one synthetic granted resource that starts with it — derived from the
 * model itself (not a hand-maintained parallel list) so it can't drift out
 * of sync with `nav-model.ts`. Proves the sidebar renders exactly 04 §68's
 * list end to end through the real `useNavigation`/`usePermissions` stack —
 * a component-level stand-in for the roadmap's E2E requirement (real
 * browser E2E is deferred, see F1's own deferred-items note).
 */
function grantAll() {
  const prefixes = new Set<string>();
  for (const workspace of Object.values(ROLE_WORKSPACES)) {
    for (const item of workspace.items) {
      if (item.match === 'always') continue;
      for (const prefix of item.match) prefixes.add(prefix);
    }
  }
  return [...prefixes].map((prefix) => ({
    resource: `${prefix}__granted`,
    section: 'Question Bank',
    label: 'x',
    action: 'READ' as const,
    scope: 'SCHOOL' as const,
  }));
}

function renderNav(role: Role) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RoleNavigation role={role} />
    </QueryClientProvider>,
  );
}

describe('RoleNavigation', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it.each(Object.keys(ROLE_WORKSPACES) as Role[])(
    '%s: fully-granted permissions render exactly the 04 §68 nav list',
    async (role) => {
      mockGet.mockReturnValueOnce(okResponse({ roles: [role], permissions: grantAll() }));
      renderNav(role);

      const expectedLabels = ROLE_WORKSPACES[role].items.map((i) => i.label);
      await waitFor(() => {
        for (const label of expectedLabels) {
          expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
        }
      });
      expect(screen.getAllByRole('link')).toHaveLength(expectedLabels.length);
    },
  );

  it('links to the workspace root for the home item and a subpath for the rest', async () => {
    mockGet.mockReturnValueOnce(okResponse({ roles: ['TEACHER'], permissions: grantAll() }));
    renderNav('TEACHER');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/teacher');
      expect(screen.getByRole('link', { name: 'Question Bank' })).toHaveAttribute(
        'href',
        '/teacher/question-bank',
      );
    });
  });

  it('marks the current route as the active nav item', async () => {
    mockGet.mockReturnValueOnce(okResponse({ roles: ['TEACHER'], permissions: grantAll() }));
    renderNav('TEACHER');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('link', { name: 'Exams' })).not.toHaveAttribute('aria-current');
    });
  });
});
