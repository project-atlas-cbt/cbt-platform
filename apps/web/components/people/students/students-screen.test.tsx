import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentsScreen } from './students-screen';
import { useStudentsPaginated } from '@/lib/people/queries';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useHasPermission } from '@/lib/nav';
import { NetworkError } from '@/lib/api';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/people/queries', () => ({ useStudentsPaginated: vi.fn() }));
vi.mock('@/lib/academics/queries', () => ({ useAcademicsContext: vi.fn(), useClasses: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseStudentsPaginated = vi.mocked(useStudentsPaginated);
const mockUseAcademicsContext = vi.mocked(useAcademicsContext);
const mockUseClasses = vi.mocked(useClasses);
const mockUseHasPermission = vi.mocked(useHasPermission);

function result(
  students: unknown[],
  overrides: Partial<{ isPending: boolean; isError: boolean; error: unknown; total: number }> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: overrides.isError ? new NetworkError() : undefined,
    data: { students, total: overrides.total ?? students.length, page: 1, pageSize: 25 },
    refetch: vi.fn(),
    ...overrides,
  };
}

const STUDENTS = [
  {
    studentProfileId: 'sp1',
    displayName: 'Ada Okoye',
    studentId: 'ST001',
    currentClassName: 'SS2A',
    departmentName: 'Sciences',
    userStatus: 'ACTIVE',
  },
];

describe('StudentsScreen', () => {
  beforeEach(() => {
    replace.mockReset();
    params = new URLSearchParams();
    mockUseStudentsPaginated.mockReset();
    mockUseAcademicsContext.mockReturnValue({ data: { session: { id: 'sess1' } } } as never);
    mockUseClasses.mockReturnValue({ data: { classes: [{ id: 'c1', name: 'SS2A' }] } } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state while pending', () => {
    mockUseStudentsPaginated.mockReturnValue(result([], { isPending: true }) as never);
    render(<StudentsScreen basePath="/school/people" />);
    expect(screen.queryByText('No students yet')).not.toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    mockUseStudentsPaginated.mockReturnValue(result([], { isError: true }) as never);
    render(<StudentsScreen basePath="/school/people" />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows the first-run empty state with no filters applied', () => {
    mockUseStudentsPaginated.mockReturnValue(result([]) as never);
    render(<StudentsScreen basePath="/school/people" />);
    expect(screen.getByText('No students yet')).toBeInTheDocument();
  });

  it('renders real rows with class, department, and status', () => {
    mockUseStudentsPaginated.mockReturnValue(result(STUDENTS) as never);
    render(<StudentsScreen basePath="/school/people" />);
    expect(screen.getByRole('link', { name: 'Ada Okoye' })).toHaveAttribute(
      'href',
      '/school/people/students/sp1',
    );
    expect(screen.getByText('SS2A')).toBeInTheDocument();
    expect(screen.getByText('Sciences')).toBeInTheDocument();
  });

  it('searching updates the URL and resets to page 1', async () => {
    mockUseStudentsPaginated.mockReturnValue(result([]) as never);
    render(<StudentsScreen basePath="/school/people" />);
    await userEvent.type(screen.getByLabelText(/search/i), 'Ada{Enter}');
    expect(replace).toHaveBeenCalledWith('/school/people/students?q=Ada');
  });

  it('paginates via the DataTable pager when there is more than one page', async () => {
    mockUseStudentsPaginated.mockReturnValue(result(STUDENTS, { total: 30 }) as never);
    render(<StudentsScreen basePath="/school/people" />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(replace).toHaveBeenCalledWith('/school/people/students?page=2');
  });

  it('hides the Add student action for a view-only actor', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseStudentsPaginated.mockReturnValue(result(STUDENTS) as never);
    render(<StudentsScreen basePath="/hod/people" />);
    expect(screen.queryByRole('button', { name: /add student/i })).not.toBeInTheDocument();
  });
});
