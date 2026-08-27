import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolsListPage from './page';
import { useSchools } from '@/lib/platform/queries';
import { NetworkError } from '@/lib/api';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/platform/queries', () => ({ useSchools: vi.fn() }));
const mockUseSchools = vi.mocked(useSchools);

function result(
  schools: unknown[],
  overrides: Partial<{ isPending: boolean; isError: boolean; error: unknown; total: number }> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: overrides.isError ? new NetworkError() : undefined,
    data: { schools, total: overrides.total ?? schools.length, page: 1, pageSize: 25 },
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('SchoolsListPage', () => {
  beforeEach(() => {
    replace.mockReset();
    params = new URLSearchParams();
    mockUseSchools.mockReset();
  });

  it('shows the platform-empty state with no status/search filters applied', () => {
    mockUseSchools.mockReturnValue(result([]) as never);
    render(<SchoolsListPage />);
    expect(screen.getByText('No schools have been onboarded yet.')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the query is pending', () => {
    mockUseSchools.mockReturnValue(result([], { isPending: true }) as never);
    render(<SchoolsListPage />);
    expect(screen.queryByText('No schools have been onboarded yet.')).not.toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    mockUseSchools.mockReturnValue(result([], { isError: true }) as never);
    render(<SchoolsListPage />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders real rows with status badges and a working View link', () => {
    mockUseSchools.mockReturnValue(
      result([
        {
          id: 's1',
          name: 'Greenfield College',
          subdomain: 'greenfield',
          status: 'ACTIVE',
          studentCount: 500,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]) as never,
    );
    render(<SchoolsListPage />);
    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    // "Active" also appears as a filter checkbox label — this is the status
    // badge specifically (a table cell), not any match of the word.
    expect(within(screen.getByRole('table')).getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute(
      'href',
      '/admin/schools/s1',
    );
  });

  it('toggling a status checkbox updates the URL, not just local state', async () => {
    mockUseSchools.mockReturnValue(result([]) as never);
    render(<SchoolsListPage />);
    await userEvent.click(screen.getByLabelText('Suspended'));
    expect(replace).toHaveBeenCalledWith('/admin/schools?status=SUSPENDED');
  });

  it('shows a Renew action only for an EXPIRED school, linking to its subscription tab', () => {
    mockUseSchools.mockReturnValue(
      result([
        {
          id: 's1',
          name: 'Lapsed School',
          subdomain: 'lapsed',
          status: 'EXPIRED',
          studentCount: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]) as never,
    );
    render(<SchoolsListPage />);
    expect(screen.getByRole('link', { name: /renew/i })).toHaveAttribute(
      'href',
      '/admin/schools/s1/subscription',
    );
  });

  // F3 gap closure (pagination) — server-side search/filter/sort/pagination.
  it('renders the pager once the server reports more than one page, and Next updates the URL page param', async () => {
    const oneRow = [
      {
        id: 's1',
        name: 'Greenfield College',
        subdomain: 'greenfield',
        status: 'ACTIVE',
        studentCount: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockUseSchools.mockReturnValue(result(oneRow, { total: 60 }) as never);
    render(<SchoolsListPage />);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(replace).toHaveBeenCalledWith('/admin/schools?page=2');
  });

  it('narrowing the status filter resets the page back to 1', async () => {
    params = new URLSearchParams('page=2');
    mockUseSchools.mockReturnValue(result([], { total: 60 }) as never);
    render(<SchoolsListPage />);
    await userEvent.click(screen.getByLabelText('Suspended'));
    const url = replace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('status=SUSPENDED');
    expect(url).not.toContain('page=');
  });

  it('the Students column is not a sort control — it is not sortable server-side (RLS constraint)', () => {
    mockUseSchools.mockReturnValue(
      result([
        {
          id: 's1',
          name: 'Greenfield College',
          subdomain: 'greenfield',
          status: 'ACTIVE',
          studentCount: 500,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]) as never,
    );
    render(<SchoolsListPage />);
    expect(screen.queryByRole('button', { name: /students/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Students')).toBeInTheDocument();
  });
});
