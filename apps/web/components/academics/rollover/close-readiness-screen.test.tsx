import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloseReadinessScreen } from './close-readiness-screen';
import { useCloseReadiness, useSession, useSessions } from '@/lib/academics/queries';
import { useCloseSession, useCreateRolloverPlan } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useCloseReadiness: vi.fn(),
  useSession: vi.fn(),
  useSessions: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useCloseSession: vi.fn(),
  useCreateRolloverPlan: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUseCloseReadiness = vi.mocked(useCloseReadiness);
const mockUseSession = vi.mocked(useSession);
const mockUseSessions = vi.mocked(useSessions);
const mockUseCloseSession = vi.mocked(useCloseSession);
const mockUseCreateRolloverPlan = vi.mocked(useCreateRolloverPlan);
const mockUseHasPermission = vi.mocked(useHasPermission);

describe('CloseReadinessScreen', () => {
  const closeMutateAsync = vi.fn();
  const createPlanMutateAsync = vi.fn();

  beforeEach(() => {
    closeMutateAsync.mockReset();
    createPlanMutateAsync.mockReset();
    mockUseHasPermission.mockReturnValue(true);

    mockUseSession.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 'sess-1',
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-07-31',
        status: 'CURRENT',
      },
      refetch: vi.fn(),
    } as never);

    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        sessions: [
          {
            id: 'sess-target',
            name: '2027/2028',
            startDate: '2027-09-01',
            endDate: '2028-07-31',
            status: 'UPCOMING',
          },
        ],
      },
    } as never);

    mockUseCloseSession.mockReturnValue({
      mutateAsync: closeMutateAsync,
      isPending: false,
    } as never);

    mockUseCreateRolloverPlan.mockReturnValue({
      mutateAsync: createPlanMutateAsync,
      isPending: false,
    } as never);
  });

  it('renders loading skeleton while fetching', () => {
    mockUseSession.mockReturnValue({ isPending: true } as never);
    render(<CloseReadinessScreen sessionId="sess-1" basePath="/school/academics" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders error state on query failure', () => {
    mockUseCloseReadiness.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('Failed to load readiness'),
      refetch: vi.fn(),
    } as never);
    render(<CloseReadinessScreen sessionId="sess-1" basePath="/school/academics" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load readiness');
  });

  it('displays blocking indicators when active exams or pending results exist', () => {
    mockUseCloseReadiness.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        sessionId: 'sess-1',
        sessionStatus: 'CURRENT',
        activeExams: 2,
        pendingResults: 5,
        activeStudents: 450,
        ready: false,
      },
    } as never);

    render(<CloseReadinessScreen sessionId="sess-1" basePath="/school/academics" />);

    expect(screen.getByText('Session cannot be closed yet')).toBeInTheDocument();
    expect(screen.getByText('Blocking (2)')).toBeInTheDocument();
    expect(screen.getByText('Blocking (5)')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: /Close Academic Session/i });
    expect(closeBtn).toBeDisabled();
  });

  it('enables Close Academic Session when ready === true and opens confirmation dialog', async () => {
    const user = userEvent.setup();
    mockUseCloseReadiness.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        sessionId: 'sess-1',
        sessionStatus: 'CURRENT',
        activeExams: 0,
        pendingResults: 0,
        activeStudents: 450,
        ready: true,
      },
    } as never);

    render(<CloseReadinessScreen sessionId="sess-1" basePath="/school/academics" />);

    expect(screen.getByText('Session is ready to be closed')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: /Close Academic Session/i });
    expect(closeBtn).toBeEnabled();

    await user.click(closeBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Close Academic Session 2026\/2027\?/i)).toBeInTheDocument();
  });

  it('renders target session selection and plan generation when session is CLOSED', () => {
    mockUseSession.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 'sess-1',
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-07-31',
        status: 'CLOSED',
      },
    } as never);

    mockUseCloseReadiness.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        sessionId: 'sess-1',
        sessionStatus: 'CLOSED',
        activeExams: 0,
        pendingResults: 0,
        activeStudents: 450,
        ready: true,
      },
    } as never);

    render(<CloseReadinessScreen sessionId="sess-1" basePath="/school/academics" />);

    expect(
      screen.getByText(/This academic session is closed. Select target session/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Rollover Plan/i })).toBeInTheDocument();
  });
});
