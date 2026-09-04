import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHasPermission } from '@/lib/nav';
import { SessionsTable } from './sessions-table';

vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
const mockUseHasPermission = vi.mocked(useHasPermission);

function session(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 's1',
    examId: 'e1',
    sessionType: 'STANDARD',
    status: 'OPEN',
    openedAt: '2026-01-01T00:00:00Z',
    openedByMembershipId: 'm1',
    openedByName: 'Ade Ola',
    closedAt: null,
    closedByMembershipId: null,
    closedByName: null,
    reopenedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as never;
}

describe('SessionsTable', () => {
  beforeEach(() => {
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows Close only for an OPEN session the actor has permission for', () => {
    render(
      <SessionsTable
        examId="e1"
        examStatus="OPEN"
        sessions={[session({ id: 's1', status: 'OPEN' }), session({ id: 's2', status: 'CLOSED' })]}
        basePath="/teacher/exam-control"
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /^close$/i })).toHaveLength(1);
  });

  it('shows Reopen for a CLOSED session, disabled when the parent exam is not OPEN', () => {
    render(
      <SessionsTable
        examId="e1"
        examStatus="CLOSED"
        sessions={[session({ id: 's1', status: 'CLOSED' })]}
        basePath="/teacher/exam-control"
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /reopen/i })).toBeDisabled();
  });

  it('hides Close/Reopen entirely when the actor lacks the permission', () => {
    mockUseHasPermission.mockReturnValue(false);
    render(
      <SessionsTable
        examId="e1"
        examStatus="OPEN"
        sessions={[session({ id: 's1', status: 'OPEN' })]}
        basePath="/teacher/exam-control"
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
  });

  it("calls onRequestClose with the row's session id", async () => {
    const onRequestClose = vi.fn();
    render(
      <SessionsTable
        examId="e1"
        examStatus="OPEN"
        sessions={[session({ id: 's1', status: 'OPEN' })]}
        basePath="/teacher/exam-control"
        onRequestClose={onRequestClose}
        onRequestReopen={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onRequestClose).toHaveBeenCalledWith('s1');
  });

  it('links "Manage students" to the roster with this session pre-selected', () => {
    render(
      <SessionsTable
        examId="e1"
        examStatus="OPEN"
        sessions={[session({ id: 's1', status: 'OPEN' })]}
        basePath="/teacher/exam-control"
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: /manage students/i })).toHaveAttribute(
      'href',
      '/teacher/exam-control/e1/students?sessionId=s1',
    );
  });

  it('shows an empty state with no sessions', () => {
    render(
      <SessionsTable
        examId="e1"
        examStatus="READY"
        sessions={[]}
        basePath="/teacher/exam-control"
        onRequestClose={vi.fn()}
        onRequestReopen={vi.fn()}
      />,
    );
    expect(screen.getByText(/no sessions opened yet/i)).toBeInTheDocument();
  });
});
