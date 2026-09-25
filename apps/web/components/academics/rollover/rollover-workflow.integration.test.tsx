import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloseReadinessScreen } from './close-readiness-screen';
import { RolloverPlanScreen } from './rollover-plan-screen';
import { StudentDecisionsScreen } from './student-decisions-screen';
import { RolloverConfirmScreen } from './rollover-confirm-screen';
import {
  useCloseReadiness,
  useSession,
  useSessions,
  useRolloverPlan,
  useDepartments,
  useSubjects,
} from '@/lib/academics/queries';
import {
  useCloseSession,
  useCreateRolloverPlan,
  useUpdateRolloverStructure,
  useUpdateRolloverDecisions,
  useCommitRollover,
} from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries');
vi.mock('@/lib/academics/mutations');
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUseCloseReadiness = vi.mocked(useCloseReadiness);
const mockUseSession = vi.mocked(useSession);
const mockUseSessions = vi.mocked(useSessions);
const mockUseRolloverPlan = vi.mocked(useRolloverPlan);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSubjects = vi.mocked(useSubjects);

const mockUseCloseSession = vi.mocked(useCloseSession);
const mockUseCreateRolloverPlan = vi.mocked(useCreateRolloverPlan);
const mockUseUpdateRolloverStructure = vi.mocked(useUpdateRolloverStructure);
const mockUseUpdateRolloverDecisions = vi.mocked(useUpdateRolloverDecisions);
const mockUseCommitRollover = vi.mocked(useCommitRollover);
const mockUseHasPermission = vi.mocked(useHasPermission);

describe('Rollover Workflow Integration', () => {
  const closeSessionMutate = vi.fn();
  const createPlanMutate = vi.fn();
  const updateStructureMutate = vi.fn();
  const updateDecisionsMutate = vi.fn();
  const commitRolloverMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHasPermission.mockReturnValue(true);

    mockUseCloseSession.mockReturnValue({
      mutateAsync: closeSessionMutate,
      isPending: false,
    } as never);
    mockUseCreateRolloverPlan.mockReturnValue({
      mutateAsync: createPlanMutate,
      isPending: false,
    } as never);
    mockUseUpdateRolloverStructure.mockReturnValue({
      mutateAsync: updateStructureMutate,
      isPending: false,
    } as never);
    mockUseUpdateRolloverDecisions.mockReturnValue({
      mutateAsync: updateDecisionsMutate,
      isPending: false,
    } as never);
    mockUseCommitRollover.mockReturnValue({
      mutateAsync: commitRolloverMutate,
      isPending: false,
    } as never);

    mockUseDepartments.mockReturnValue({ data: { departments: [] } } as never);
    mockUseSubjects.mockReturnValue({ data: { subjects: [] } } as never);
    mockUseSessions.mockReturnValue({ data: { sessions: [] } } as never);
  });

  it('progresses through the full rollover lifecycle: close readiness -> plan review -> decisions -> commit', async () => {
    const user = userEvent.setup();

    // 1. Stage 1: Close Readiness Screen
    mockUseSession.mockReturnValue({
      isPending: false,
      data: {
        id: 'sess-current',
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-07-31',
        status: 'CURRENT',
      },
    } as never);
    mockUseCloseReadiness.mockReturnValue({
      isPending: false,
      data: {
        sessionId: 'sess-current',
        sessionStatus: 'CURRENT',
        activeExams: 0,
        pendingResults: 0,
        activeStudents: 350,
        ready: true,
      },
    } as never);

    const { unmount: unmountReadiness } = render(
      <CloseReadinessScreen sessionId="sess-current" basePath="/school/academics" />,
    );
    expect(screen.getByText('Session is ready to be closed')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: /Close Academic Session/i });
    await user.click(closeBtn);
    const dialogConfirm = screen.getByRole('button', { name: /^Close Session$/i });
    await user.click(dialogConfirm);
    expect(closeSessionMutate).toHaveBeenCalledWith('sess-current');
    unmountReadiness();

    // 2. Stage 2: Rollover Plan Review & Structure
    const planFixture = {
      id: 'plan-101',
      sourceAcademicSessionId: 'sess-current',
      targetAcademicSessionId: 'sess-target',
      status: 'READY',
      version: 1,
      readiness: {},
      structure: {
        classes: [
          { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A', included: true },
          { id: 'c2', name: 'JSS2A', level: 'JSS2', arm: 'A', included: true },
        ],
        offerings: [],
        staffAssignments: [
          {
            id: 's1',
            assignmentKind: 'TEACHER',
            membershipId: 'm1',
            targetDraftClassId: 'c1',
            confirmed: false,
          },
        ],
      },
      pagination: { page: 1, pageSize: 50, total: 350 },
    };

    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      data: planFixture,
      refetch: vi.fn(),
    } as never);

    const { unmount: unmountPlan } = render(
      <RolloverPlanScreen planId="plan-101" basePath="/school/academics" />,
    );
    expect(screen.getByText('Cloned Classes')).toBeInTheDocument();
    expect(screen.getByText('JSS1A')).toBeInTheDocument();
    unmountPlan();

    // 3. Stage 3: Student Decisions Review & Exception Handling
    const decisionsFixture = {
      ...planFixture,
      decisions: [
        {
          id: 'dec-ahmed',
          sourceEnrollmentId: 'enr-ahmed',
          sourceClassId: 'c1',
          proposedOutcome: 'PROMOTE',
          outcome: 'PROMOTE',
          targetDraftClassId: 'c2',
          reason: 'SYSTEM_LEVEL_PROGRESSION',
          sourceClass: { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A' },
          sourceEnrollment: {
            id: 'enr-ahmed',
            studentProfile: {
              studentId: 'ST-01',
              membership: {
                loginIdentifier: 'ahmed.01',
                user: { firstName: 'Ahmed', lastName: 'Ibrahim', displayName: 'Ahmed Ibrahim' },
              },
            },
          },
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 1 },
    };
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      data: decisionsFixture,
      refetch: vi.fn(),
    } as never);

    const { unmount: unmountDecisions } = render(
      <StudentDecisionsScreen planId="plan-101" basePath="/school/academics" />,
    );
    expect(screen.getByText('Ahmed Ibrahim')).toBeInTheDocument();
    const overrideBtn = screen.getByRole('button', { name: /Override/i });
    await user.click(overrideBtn);

    // Fill in decision override with reason
    const reasonInput = screen.getByLabelText(/Reason for Override/i);
    await user.type(reasonInput, 'Repeated academic year due to medical absence');
    // In our test, target draft class is already set for PROMOTE or selected
    unmountDecisions();

    // 4. Stage 4: Final Confirmation and Commit
    mockUseSession.mockImplementation(
      (id) =>
        ({
          isPending: false,
          data: {
            id,
            name: id === 'sess-current' ? '2026/2027' : '2027/2028',
          },
        }) as never,
    );

    const { unmount: unmountConfirm } = render(
      <RolloverConfirmScreen planId="plan-101" basePath="/school/academics" />,
    );
    expect(screen.getByText(/Historical Academic Integrity Guarantee/i)).toBeInTheDocument();

    // Confirm checkbox & typed session name
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    const sessionInput = screen.getByLabelText(/Type 2027\/2028 to confirm/i);
    await user.type(sessionInput, '2027/2028');

    const commitBtn = screen.getByRole('button', { name: /Commit Session Rollover/i });
    expect(commitBtn).toBeEnabled();
    await user.click(commitBtn);
    expect(commitRolloverMutate).toHaveBeenCalledWith(1);
    unmountConfirm();
  }, 60000);
});
