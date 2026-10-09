import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolloverPlanScreen } from './rollover-plan-screen';
import {
  useRolloverPlan,
  useSession,
  useSessions,
  useDepartments,
  useSubjects,
} from '@/lib/academics/queries';
import { useUpdateRolloverStructure } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useStreams: () => ({ data: { streams: [] }, isSuccess: true, isPending: false }),
  useRolloverPlan: vi.fn(),
  useSession: vi.fn(),
  useSessions: vi.fn(),
  useDepartments: vi.fn(),
  useSubjects: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useUpdateRolloverStructure: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('next/navigation', () => ({
  // HelpLink (ADR-0035) reads the path; outside a workspace it renders nothing.
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUseRolloverPlan = vi.mocked(useRolloverPlan);
const mockUseSession = vi.mocked(useSession);
const mockUseSessions = vi.mocked(useSessions);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseUpdateRolloverStructure = vi.mocked(useUpdateRolloverStructure);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SAMPLE_PLAN = {
  id: 'plan-1',
  sourceAcademicSessionId: 'sess-1',
  targetAcademicSessionId: 'sess-2',
  status: 'READY',
  version: 1,
  readiness: {},
  decisions: [],
  structure: {
    classes: [
      { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A', departmentId: null, included: true },
      { id: 'c2', name: 'JSS2A', level: 'JSS2', arm: 'A', departmentId: null, included: true },
    ],
    offerings: [{ id: 'o1', targetDraftClassId: 'c1', subjectId: 'sub-1', included: true }],
    staffAssignments: [
      {
        id: 'st1',
        assignmentKind: 'TEACHER',
        membershipId: 'm1',
        targetDraftClassId: 'c1',
        subjectId: 'sub-1',
        confirmed: false,
      },
    ],
  },
  pagination: { page: 1, pageSize: 50, total: 120 },
};

describe('RolloverPlanScreen', () => {
  const updateStructureMutateAsync = vi.fn();

  beforeEach(() => {
    updateStructureMutateAsync.mockReset();
    mockUseHasPermission.mockReturnValue(true);

    mockUseSession.mockImplementation(
      (id) =>
        ({
          isPending: false,
          isError: false,
          data: {
            id,
            name: id === 'sess-1' ? '2026/2027' : '2027/2028',
          },
        }) as never,
    );

    mockUseDepartments.mockReturnValue({
      data: { departments: [] },
    } as never);

    mockUseSubjects.mockReturnValue({
      data: { subjects: [{ id: 'sub-1', name: 'Mathematics' }] },
    } as never);

    mockUseUpdateRolloverStructure.mockReturnValue({
      mutateAsync: updateStructureMutateAsync,
      isPending: false,
    } as never);

    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never);
  });

  it('renders landing screen when no planId is specified', () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      data: {
        sessions: [
          {
            id: 's-closed',
            name: '2025/2026',
            status: 'CLOSED',
            startDate: '2025-09-01',
            endDate: '2026-07-31',
          },
        ],
      },
    } as never);

    render(<RolloverPlanScreen basePath="/school/academics" />);
    expect(screen.getByText('Closed Sessions Ready for Rollover')).toBeInTheDocument();
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
  });

  it('renders plan overview and structural tabs when planId is provided', () => {
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<RolloverPlanScreen planId="plan-1" basePath="/school/academics" />);

    expect(screen.getByText(/2026\/2027 → 2027\/2028/)).toBeInTheDocument();
    expect(screen.getByText('JSS1A')).toBeInTheDocument();
    expect(screen.getByText('JSS2A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Student Decisions \(120\)/i })).toBeInTheDocument();
  });

  it('allows toggling class inclusion and saving updates', async () => {
    const user = userEvent.setup();
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<RolloverPlanScreen planId="plan-1" basePath="/school/academics" />);

    const jss1Checkbox = screen.getByRole('checkbox', { name: /Include JSS1A/i });
    expect(jss1Checkbox).toBeChecked();

    await user.click(jss1Checkbox);
    expect(jss1Checkbox).not.toBeChecked();

    const saveBtn = screen.getByRole('button', { name: /Save Structure Changes/i });
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    expect(updateStructureMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: [{ draftId: 'c1', included: false }],
        version: 1,
      }),
    );
  });
});
