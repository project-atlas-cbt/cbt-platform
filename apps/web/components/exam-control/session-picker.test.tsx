import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionPicker } from './session-picker';

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

describe('SessionPicker', () => {
  it('renders nothing when no session is OPEN', () => {
    const { container } = render(
      <SessionPicker
        sessions={[session({ id: 's1', status: 'CLOSED' })]}
        selectedSessionId={undefined}
        onSelect={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists only OPEN sessions, marking the selected one pressed', () => {
    render(
      <SessionPicker
        sessions={[
          session({ id: 's1', status: 'OPEN', sessionType: 'STANDARD' }),
          session({ id: 's2', status: 'CLOSED', sessionType: 'BATCH' }),
        ]}
        selectedSessionId="s1"
        onSelect={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with the clicked session id', async () => {
    const onSelect = vi.fn();
    render(
      <SessionPicker
        sessions={[session({ id: 's1', status: 'OPEN' })]}
        selectedSessionId={undefined}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('s1');
  });
});
