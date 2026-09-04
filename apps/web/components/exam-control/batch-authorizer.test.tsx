import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthorizeParticipants } from '@/lib/exam-control/mutations';
import { BatchAuthorizer } from './batch-authorizer';

vi.mock('@/lib/exam-control/mutations', () => ({ useAuthorizeParticipants: vi.fn() }));
const mockUseAuthorizeParticipants = vi.mocked(useAuthorizeParticipants);

function student(overrides: Partial<Record<string, unknown>>) {
  return {
    studentProfileId: 'sp1',
    studentIdNumber: 'ST-001',
    studentName: 'Tunde Bello',
    eligible: true,
    failedChecks: [],
    participantStatus: null,
    ...overrides,
  } as never;
}

describe('BatchAuthorizer', () => {
  const mutateAsync = vi.fn();
  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseAuthorizeParticipants.mockReturnValue({ mutateAsync, isPending: false } as never);
  });

  it('ADR-0006: defaults the "not yet authorized" filter active for EXPLICIT_AUTHORIZATION exams', () => {
    render(
      <BatchAuthorizer
        examId="e1"
        sessionId="s1"
        accessMode="EXPLICIT_AUTHORIZATION"
        students={[student({ studentProfileId: 'sp1' })]}
      />,
    );
    expect(screen.getByRole('button', { name: /not yet authorized/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not default the filter active for OPEN_TO_ELIGIBLE exams', () => {
    render(
      <BatchAuthorizer
        examId="e1"
        sessionId="s1"
        accessMode="OPEN_TO_ELIGIBLE"
        students={[student({ studentProfileId: 'sp1' })]}
      />,
    );
    expect(screen.getByRole('button', { name: /not yet authorized/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('never silently drops a reported-ineligible id — renders its failed checks inline', async () => {
    mutateAsync.mockResolvedValue({
      results: [{ studentProfileId: 'sp1', authorized: false, failedChecks: ['NOT_ENROLLED'] }],
    });
    render(
      <BatchAuthorizer
        examId="e1"
        sessionId="s1"
        accessMode="OPEN_TO_ELIGIBLE"
        students={[student({ studentProfileId: 'sp1' })]}
      />,
    );
    await userEvent.click(screen.getByLabelText(/select tunde bello/i));
    await userEvent.click(screen.getByRole('button', { name: /authorize selected/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ sessionId: 's1', studentProfileIds: ['sp1'] });
    expect(await screen.findByText(/not authorized: not_enrolled/i)).toBeInTheDocument();
  });

  it('an ineligible student cannot be selected at all', () => {
    render(
      <BatchAuthorizer
        examId="e1"
        sessionId="s1"
        accessMode="OPEN_TO_ELIGIBLE"
        students={[
          student({ studentProfileId: 'sp1', eligible: false, failedChecks: ['NOT_ENROLLED'] }),
        ]}
      />,
    );
    expect(screen.getByLabelText(/select tunde bello/i)).toBeDisabled();
  });

  it('shows a server error inline on a rejected authorize call', async () => {
    mutateAsync.mockRejectedValue(new Error('network down'));
    render(
      <BatchAuthorizer
        examId="e1"
        sessionId="s1"
        accessMode="OPEN_TO_ELIGIBLE"
        students={[student({ studentProfileId: 'sp1' })]}
      />,
    );
    await userEvent.click(screen.getByLabelText(/select tunde bello/i));
    await userEvent.click(screen.getByRole('button', { name: /authorize selected/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
