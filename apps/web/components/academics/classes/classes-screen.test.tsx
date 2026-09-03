import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassesScreen } from './classes-screen';
import {
  useAcademicsContext,
  useClasses,
  useDepartments,
  useSessions,
} from '@/lib/academics/queries';
import { useCreateClass } from '@/lib/onboarding/mutations';
import { useArchiveClass, useDeleteClass, useUpdateClass } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useDepartments: vi.fn(),
  useSessions: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateClass: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({
  useArchiveClass: vi.fn(),
  useDeleteClass: vi.fn(),
  useUpdateClass: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseAcademicsContext = vi.mocked(useAcademicsContext);
const mockUseClasses = vi.mocked(useClasses);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSessions = vi.mocked(useSessions);
const mockUseCreateClass = vi.mocked(useCreateClass);
const mockUseArchiveClass = vi.mocked(useArchiveClass);
const mockUseDeleteClass = vi.mocked(useDeleteClass);
const mockUseUpdateClass = vi.mocked(useUpdateClass);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SESSIONS = [
  {
    id: 's1',
    name: '2026/2027',
    startDate: '2026-09-01',
    endDate: '2027-07-31',
    status: 'CURRENT',
  },
];
const CLASSES = [
  {
    id: 'c1',
    academicSessionId: 's1',
    departmentId: null,
    name: 'SS2A',
    level: 'SS2',
    arm: 'A',
    status: 'ACTIVE',
  },
];

describe('ClassesScreen', () => {
  const createMutateAsync = vi.fn();
  const archiveMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();
  const updateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    archiveMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    mockUseAcademicsContext.mockReturnValue({ data: { session: SESSIONS[0] } } as never);
    mockUseDepartments.mockReturnValue({ data: { departments: [] } } as never);
    mockUseCreateClass.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    mockUseArchiveClass.mockReturnValue({
      mutateAsync: archiveMutateAsync,
      isPending: false,
    } as never);
    mockUseDeleteClass.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
    mockUseUpdateClass.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
  });

  it('shows an honest empty state when no academic session exists yet', () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: [] },
    } as never);
    render(<ClassesScreen basePath="/school/academics" />);
    expect(screen.getByText('No academic sessions yet')).toBeInTheDocument();
  });

  it('lists real classes with a session badge chip next to the name (DoD item 3)', () => {
    mockUseClasses.mockReturnValue({
      isPending: false,
      isError: false,
      data: { classes: CLASSES },
    } as never);
    render(<ClassesScreen basePath="/school/academics" />);
    const row = within(screen.getByRole('table'));
    expect(row.getByText('SS2A')).toBeInTheDocument();
    expect(row.getByText('2026/2027')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SS2A' })).toHaveAttribute(
      'href',
      '/school/academics/classes/c1',
    );
    // The name link alone doesn't read as interactive next to a badge — a
    // real user reported no way into Class Detail with only the "..." menu
    // looking clickable. An explicit "View" link is the fix.
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/school/academics/classes/c1',
    );
  });

  it('shows the first-run empty state for a session with no classes yet', () => {
    mockUseClasses.mockReturnValue({
      isPending: false,
      isError: false,
      data: { classes: [] },
    } as never);
    render(<ClassesScreen basePath="/school/academics" />);
    expect(screen.getByText('No classes in this session yet')).toBeInTheDocument();
  });

  it('creating a class calls the mutation with the selected session id', async () => {
    mockUseClasses.mockReturnValue({
      isPending: false,
      isError: false,
      data: { classes: [] },
    } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 'c2' });
    render(<ClassesScreen basePath="/school/academics" />);

    await userEvent.click(screen.getAllByRole('button', { name: /add class/i })[0]!);
    await userEvent.type(screen.getByLabelText(/arm/i), 'B');
    await userEvent.type(screen.getByLabelText(/class name/i), 'SS2B');
    await userEvent.click(screen.getByRole('button', { name: /create class/i }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ academicSessionId: 's1', name: 'SS2B', arm: 'B' }),
    );
  });

  it('archiving a class shows a confirm dialog and calls the mutation', async () => {
    mockUseClasses.mockReturnValue({
      isPending: false,
      isError: false,
      data: { classes: CLASSES },
    } as never);
    archiveMutateAsync.mockResolvedValueOnce(CLASSES[0]);
    render(<ClassesScreen basePath="/school/academics" />);

    await userEvent.click(screen.getByRole('button', { name: /actions for ss2a/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    await userEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    expect(archiveMutateAsync).toHaveBeenCalledWith('c1');
  });

  it('hides every mutating control for a view-only actor (HOD), read access preserved', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseClasses.mockReturnValue({
      isPending: false,
      isError: false,
      data: { classes: CLASSES },
    } as never);
    render(<ClassesScreen basePath="/hod/academics" />);
    expect(screen.queryByRole('button', { name: /add class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SS2A' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
  });
});
