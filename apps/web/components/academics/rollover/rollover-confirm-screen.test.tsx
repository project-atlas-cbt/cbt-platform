import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolloverConfirmScreen } from './rollover-confirm-screen';
import { useRolloverPlan, useSession } from '@/lib/academics/queries';
import { useCommitRollover } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useRolloverPlan: vi.fn(),
  useSession: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useCommitRollover: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseRolloverPlan = vi.mocked(useRolloverPlan);
const mockUseSession = vi.mocked(useSession);
const mockUseCommitRollover = vi.mocked(useCommitRollover);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SAMPLE_READY_PLAN = {
  id: 'plan-1',
  sourceAcademicSessionId: 'sess-1',
  targetAcademicSessionId: 'sess-2',
  status: 'READY',
  version: 3,
  readiness: {},
  structure: {
    classes: [
      { id: 'c1', included: true },
      { id: 'c2', included: true },
    ],
    offerings: [
      { id: 'o1', included: true },
      { id: 'o2', included: true },
    ],
    staffAssignments: [{ id: 's1', confirmed: true }],
  },
  pagination: { page: 1, pageSize: 50, total: 240 },
};

describe('RolloverConfirmScreen', () => {
  const commitMutateAsync = vi.fn();

  beforeEach(() => {
    commitMutateAsync.mockReset();
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

    mockUseCommitRollover.mockReturnValue({
      mutateAsync: commitMutateAsync,
      isPending: false,
    } as never);
  });

  it('renders historical preservation guarantee and scale metrics', () => {
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_READY_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<RolloverConfirmScreen planId="plan-1" basePath="/school/academics" />);

    expect(screen.getByText(/Historical Academic Integrity Guarantee/i)).toBeInTheDocument();
    expect(screen.getByText('240')).toBeInTheDocument(); // total candidates
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // new classes
  });

  it('disables commit button until acknowledgement is checked and target session name is typed', async () => {
    const user = userEvent.setup();
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: SAMPLE_READY_PLAN,
      refetch: vi.fn(),
    } as never);

    render(<RolloverConfirmScreen planId="plan-1" basePath="/school/academics" />);

    const commitBtn = screen.getByRole('button', { name: /Commit Session Rollover/i });
    expect(commitBtn).toBeDisabled();

    // Check acknowledgement
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(commitBtn).toBeDisabled();

    // Type matching target session name
    const input = screen.getByLabelText(/Type 2027\/2028 to confirm/i);
    await user.type(input, '2027/2028');

    expect(commitBtn).toBeEnabled();

    await user.click(commitBtn);
    expect(commitMutateAsync).toHaveBeenCalledWith(3);
  });

  it('renders post-rollover transition summary when plan status is COMMITTED', () => {
    mockUseRolloverPlan.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ...SAMPLE_READY_PLAN, status: 'COMMITTED' },
      refetch: vi.fn(),
    } as never);

    render(<RolloverConfirmScreen planId="plan-1" basePath="/school/academics" />);

    expect(screen.getByText(/Academic Session Transition Complete/i)).toBeInTheDocument();
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
    expect(screen.getByText('CURRENT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View New Classes/i })).toBeInTheDocument();
  });
});
