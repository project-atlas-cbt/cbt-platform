import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentStreamField } from './student-stream-field';
import { useStreams } from '@/lib/academics/queries';
import { useSetStudentStream } from '@/lib/academics/mutations';

vi.mock('@/lib/academics/queries', () => ({ useStreams: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({ useSetStudentStream: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('StudentStreamField', () => {
  const mutate = vi.fn();

  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(useSetStudentStream).mockReturnValue({ mutate, isPending: false } as never);
    vi.mocked(useStreams).mockReturnValue({
      isSuccess: true,
      isPending: false,
      data: {
        streams: [
          { id: 'st1', name: 'Science', status: 'ACTIVE' },
          { id: 'st2', name: 'Business', status: 'ACTIVE' },
        ],
      },
    } as never);
  });

  it('shows the stream as text when it cannot be changed', () => {
    render(
      <StudentStreamField
        studentProfileId="p1"
        streamId="st1"
        streamName="Science"
        editable={false}
      />,
    );
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('moves the student to another stream, or out of every stream', async () => {
    render(
      <StudentStreamField studentProfileId="p1" streamId="st1" streamName="Science" editable />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Stream' }));
    await userEvent.click(screen.getByRole('option', { name: 'Business' }));
    expect(mutate).toHaveBeenCalledWith('st2', expect.anything());

    await userEvent.click(screen.getByRole('combobox', { name: 'Stream' }));
    await userEvent.click(screen.getByRole('option', { name: 'No stream' }));
    expect(mutate).toHaveBeenLastCalledWith(null, expect.anything());
  });
});
