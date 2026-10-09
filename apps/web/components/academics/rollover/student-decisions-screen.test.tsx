import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentDecisionsScreen } from './student-decisions-screen';
import { useRolloverPlan, useDepartments } from '@/lib/academics/queries';
import { useUpdateRolloverDecisions } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useStreams: () => ({ data: { streams: [] }, isSuccess: true, isPending: false }),
  useRolloverPlan: vi.fn(),
  useDepartments: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useUpdateRolloverDecisions: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockUseRolloverPlan = vi.mocked(useRolloverPlan);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseUpdateRolloverDecisions = vi.mocked(useUpdateRolloverDecisions);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SAMPLE_DECISIONS_PLAN = {
  id: 'plan-1',
  sourceAcademicSessionId: 'sess-1',
  targetAcademicSessionId: 'sess-2',
  status: 'READY',
  version: 2,
  readiness: {},
  structure: {
    classes: [
      { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A', included: true },
      { id: 'c2', name: 'JSS2A', level: 'JSS2', arm: 'A', included: true },
    ],
  },
  decisions: [
    {
      id: 'dec-1',
      sourceEnrollmentId: 'enr-1',
      sourceClassId: 'c1',
      proposedOutcome: 'PROMOTE',
      outcome: 'PROMOTE',
      targetDraftClassId: 'c2',
      reason: 'SYSTEM_LEVEL_PROGRESSION',
      overriddenAt: null,
      sourceClass: { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A' },
      sourceEnrollment: {
        id: 'enr-1',
        studentProfile: {
          id: 'sp-1',
          studentId: 'ST-001',
          membership: {
            id: 'm-1',
            loginIdentifier: 'ahmed.student',
            user: {
              id: 'u-1',
              firstName: 'Ahmed',
              lastName: 'Ibrahim',
              displayName: 'Ahmed Ibrahim',
            },
          },
        },
      },
    },
    {
      id: 'dec-2',
      sourceEnrollmentId: 'enr-2',
      sourceClassId: 'c1',
      proposedOutcome: 'PROMOTE',
      outcome: 'REPEAT',
      targetDraftClassId: 'c1',
      reason: 'Academic performance review',
      overriddenAt: '2026-09-15T10:00:00Z',
      sourceClass: { id: 'c1', name: 'JSS1A', level: 'JSS1', arm: 'A' },
      sourceEnrollment: {
        id: 'enr-2',
        studentProfile: {
          id: 'sp-2',
          studentId: 'ST-002',
          membership: {
            id: 'm-2',
            loginIdentifier: 'fatima.student',
            user: {
              id: 'u-2',
              firstName: 'Fatima',
              lastName: 'Bello',
              displayName: 'Fatima Bello',
            },
          },
        },
      },
    },
  ],
  pagination: { page: 1, pageSize: 50, total: 2 },
};

describe('StudentDecisionsScreen', () => {
  const updateDecisionsMutateAsync = vi.fn();

  beforeEach(() => {
    updateDecisionsMutateAsync.mockReset();
    mockUseHasPermission.mockReturnValue(true);

    mockUseDepartments.mockReturnValue({
      data: { departments: [] },
    } as never);

    mockUseUpdateRolloverDecisions.mockReturnValue({
      mutateAsync: updateDecisionsMutateAsync,
      isPending: false,
    } as never);
  });

  it('renders loading skeleton when fetching', () => {
    mockUseRolloverPlan.mockReturnValue({ isPending: true } as never);
    render(<StudentDecisionsScreen planId="plan-1" basePath="/school/academics" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('renders student candidate rows with student name, class, and decision status', () => {
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_DECISIONS_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<StudentDecisionsScreen planId="plan-1" basePath="/school/academics" />);

    expect(screen.getByText('Ibrahim Ahmed')).toBeInTheDocument();
    expect(screen.getByText('ST-001')).toBeInTheDocument();
    expect(screen.getByText('Bello Fatima')).toBeInTheDocument();
    expect(screen.getByText('ST-002')).toBeInTheDocument();
    expect(screen.getByText('JSS2A')).toBeInTheDocument();
    expect(screen.getByText('Repeat Year')).toBeInTheDocument();
  });

  it('opens override dialog on single student override click', async () => {
    const user = userEvent.setup();
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_DECISIONS_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<StudentDecisionsScreen planId="plan-1" basePath="/school/academics" />);

    // Rows run A to Z by surname, so Bello comes before Ibrahim.
    const overrideButtons = screen.getAllByRole('button', { name: /Override/i });
    await user.click(overrideButtons[1]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Override Promotion Decision/i)).toBeInTheDocument();
    expect(screen.getByText(/Student: Ibrahim Ahmed/i)).toBeInTheDocument();
  });

  it('supports batch selection and opens batch override dialog', async () => {
    const user = userEvent.setup();
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_DECISIONS_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<StudentDecisionsScreen planId="plan-1" basePath="/school/academics" />);

    const selectAllBtn = screen.getByRole('button', { name: /Select all visible/i });
    await user.click(selectAllBtn);

    expect(screen.getByText('2 candidates selected')).toBeInTheDocument();
    const batchBtn = screen.getByRole('button', { name: /Batch Override/i });
    expect(batchBtn).toBeInTheDocument();

    await user.click(batchBtn);
    expect(screen.getByText(/Override Decision for 2 Students/i)).toBeInTheDocument();
  });
});
