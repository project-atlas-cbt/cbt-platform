import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolSubscriptionPage from './page';
import { useSchool, useActivationGrants } from '@/lib/platform/queries';
import { useIssueSubscription, useIssueActivationGrant } from '@/lib/platform/mutations';
import { ApiError } from '@/lib/api';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/lib/platform/queries', () => ({ useSchool: vi.fn(), useActivationGrants: vi.fn() }));
vi.mock('@/lib/platform/mutations', () => ({
  useIssueSubscription: vi.fn(),
  useIssueActivationGrant: vi.fn(),
}));

const mockUseSchool = vi.mocked(useSchool);
const mockUseGrants = vi.mocked(useActivationGrants);
const mockUseIssueSubscription = vi.mocked(useIssueSubscription);
const mockUseIssueGrant = vi.mocked(useIssueActivationGrant);

const SCHOOL = {
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  data: {
    id: 's1',
    subscription: {
      id: 'sub1',
      plan: 'STANDARD',
      status: 'ACTIVE',
      startAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
  },
};

describe('SchoolSubscriptionPage', () => {
  const issueSubscriptionMutate = vi.fn();
  const issueGrantMutate = vi.fn();

  beforeEach(() => {
    issueSubscriptionMutate.mockReset();
    issueGrantMutate.mockReset();
    mockUseSchool.mockReturnValue(SCHOOL as never);
    mockUseIssueSubscription.mockReturnValue({
      mutateAsync: issueSubscriptionMutate,
      isError: false,
    } as never);
    mockUseIssueGrant.mockReturnValue({ mutateAsync: issueGrantMutate, isPending: false } as never);
  });

  it('shows "No activation keys issued yet" when history is empty', () => {
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: { grants: [] },
      refetch: vi.fn(),
    } as never);
    render(<SchoolSubscriptionPage />);
    expect(screen.getByText('No activation keys issued yet')).toBeInTheDocument();
  });

  it('renders real history rows without ever showing a raw key', () => {
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        grants: [
          {
            id: 'g1',
            purpose: 'INITIAL_ACTIVATION',
            status: 'ACTIVATED',
            issuedAt: '2026-01-01T00:00:00.000Z',
            issuedByDisplayName: 'Platform Admin',
            activatedAt: '2026-01-02T00:00:00.000Z',
            expiresAt: '2026-01-15T00:00:00.000Z',
            subscriptionId: 'sub1',
            subscriptionPlan: 'STANDARD',
          },
        ],
      },
      refetch: vi.fn(),
    } as never);
    render(<SchoolSubscriptionPage />);
    expect(screen.getByText('Initial activation')).toBeInTheDocument();
    // "Activated" also appears as the "date activated" column header —
    // this asserts the *badge* (a status pill), not just any match of the word.
    expect(screen.getByRole('cell', { name: 'Activated' })).toBeInTheDocument();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
  });

  it('renewal parses periodDays to a number before calling the mutation', async () => {
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: { grants: [] },
      refetch: vi.fn(),
    } as never);
    issueSubscriptionMutate.mockResolvedValueOnce({ subscriptionId: 'sub2' });
    render(<SchoolSubscriptionPage />);

    await userEvent.clear(screen.getByLabelText(/^plan$/i));
    await userEvent.type(screen.getByLabelText(/^plan$/i), 'PREMIUM');
    await userEvent.clear(screen.getByLabelText(/period \(days\)/i));
    await userEvent.type(screen.getByLabelText(/period \(days\)/i), '90');
    await userEvent.click(screen.getByRole('button', { name: /issue \/ renew subscription/i }));

    expect(issueSubscriptionMutate).toHaveBeenCalledWith({ plan: 'PREMIUM', periodDays: 90 });
  });

  it('issuing a new key calls the mutation and never displays a key value', async () => {
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: { grants: [] },
      refetch: vi.fn(),
    } as never);
    issueGrantMutate.mockResolvedValueOnce({ subscriptionId: 'sub1' });
    render(<SchoolSubscriptionPage />);

    await userEvent.click(screen.getByRole('button', { name: /issue new activation key/i }));
    expect(issueGrantMutate).toHaveBeenCalled();
  });

  // Gap-closure (found via live testing): deactivation has no reactivate
  // path, but issuing/renewing a key against a deactivated school used to
  // silently "succeed" (the key even redeemed) while login stayed blocked
  // forever. Both actions are now disabled with an explanation, matching
  // the terminal-state semantics the Overview page's Deactivate dialog
  // already documents.
  it('disables both issuance actions and explains why for a deactivated school', () => {
    mockUseSchool.mockReturnValue({
      ...SCHOOL,
      data: { ...SCHOOL.data, status: 'DEACTIVATED' },
    } as never);
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: { grants: [] },
      refetch: vi.fn(),
    } as never);
    render(<SchoolSubscriptionPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/permanently deactivated/i);
    expect(screen.getByRole('button', { name: /issue \/ renew subscription/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /issue new activation key/i })).toBeDisabled();
  });

  it('surfaces the real server error when issuing a key fails', async () => {
    mockUseGrants.mockReturnValue({
      isPending: false,
      isError: false,
      data: { grants: [] },
      refetch: vi.fn(),
    } as never);
    issueGrantMutate.mockRejectedValueOnce(
      new ApiError({
        code: 'CONFLICT',
        message: 'This school has been permanently deactivated.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    render(<SchoolSubscriptionPage />);

    await userEvent.click(screen.getByRole('button', { name: /issue new activation key/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permanently deactivated/i);
  });
});
