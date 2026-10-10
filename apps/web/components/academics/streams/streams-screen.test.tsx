import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StreamsScreen } from './streams-screen';
import { useStreams } from '@/lib/academics/queries';
import { useCreateStream, useDeleteStream, useUpdateStream } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({ useStreams: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({
  useCreateStream: vi.fn(),
  useDeleteStream: vi.fn(),
  useUpdateStream: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const STREAMS = [
  { id: 's1', name: 'Science', code: 'SCI', status: 'ACTIVE', classCount: 3, studentCount: 88 },
  { id: 's2', name: 'Arts', code: 'ART', status: 'INACTIVE', classCount: 0, studentCount: 4 },
];

describe('StreamsScreen', () => {
  const create = vi.fn();
  const update = vi.fn();
  const updateNow = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    for (const fn of [create, update, updateNow, remove]) fn.mockReset();
    vi.mocked(useCreateStream).mockReturnValue({ mutateAsync: create, isPending: false } as never);
    vi.mocked(useUpdateStream).mockReturnValue({
      mutateAsync: update,
      mutate: updateNow,
      isPending: false,
    } as never);
    vi.mocked(useDeleteStream).mockReturnValue({ mutateAsync: remove, isPending: false } as never);
    vi.mocked(useHasPermission).mockReturnValue(true);
    vi.mocked(useStreams).mockReturnValue({
      isPending: false,
      isError: false,
      data: { streams: STREAMS },
    } as never);
  });

  it('lists streams with their class and student counts', () => {
    render(<StreamsScreen />);
    const row = screen.getByText('Science').closest('tr')!;
    expect(within(row).getByText('SCI')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('88')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('explains streams in the empty state', () => {
    vi.mocked(useStreams).mockReturnValue({
      isPending: false,
      isError: false,
      data: { streams: [] },
    } as never);
    render(<StreamsScreen />);
    expect(screen.getByText('No streams yet')).toBeInTheDocument();
    expect(screen.getByText(/Junior classes usually need none/)).toBeInTheDocument();
  });

  it('creates a stream', async () => {
    create.mockResolvedValue({});
    render(<StreamsScreen />);
    await userEvent.click(screen.getByRole('button', { name: /add stream/i }));
    await userEvent.type(screen.getByLabelText('Stream name'), 'Business');
    await userEvent.type(screen.getByLabelText('Code'), 'BUS');
    await userEvent.click(screen.getByRole('button', { name: 'Create stream' }));
    expect(create).toHaveBeenCalledWith({ name: 'Business', code: 'BUS' });
  });

  it('deactivates after confirming, and reactivates an inactive stream', async () => {
    update.mockResolvedValue({});
    render(<StreamsScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Science' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(update).toHaveBeenCalledWith({ id: 's1', status: 'INACTIVE' });

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Arts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivate' }));
    expect(updateNow).toHaveBeenCalledWith({ id: 's2', status: 'ACTIVE' });
  });

  it('hides the controls from someone who can only view', () => {
    vi.mocked(useHasPermission).mockReturnValue(false);
    render(<StreamsScreen />);
    expect(screen.queryByRole('button', { name: /add stream/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Science' })).not.toBeInTheDocument();
  });
});
