import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassForm } from './class-form';
import { useUpdateClass } from '@/lib/academics/mutations';

vi.mock('@/lib/academics/queries', () => ({
  useStreams: () => ({
    data: {
      streams: [
        { id: 'st1', name: 'Science', status: 'ACTIVE' },
        { id: 'st2', name: 'Retired', status: 'INACTIVE' },
      ],
    },
  }),
  useClassRoster: () => ({
    data: {
      students: [
        { enrollmentId: 'e1', streamId: null },
        { enrollmentId: 'e2', streamId: null },
        { enrollmentId: 'e3', streamId: 'st9' },
      ],
    },
  }),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateClass: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/lib/academics/mutations', () => ({ useUpdateClass: vi.fn() }));

const CLASS = { id: 'c1', name: 'SS2A', level: 'SS2' as const, arm: 'A', defaultStreamId: null };

describe('ClassForm stream (ADR-0038)', () => {
  const update = vi.fn();
  beforeEach(() => {
    update.mockReset().mockResolvedValue({});
    vi.mocked(useUpdateClass).mockReturnValue({ mutateAsync: update, isPending: false } as never);
  });

  it('offers only active streams', async () => {
    render(<ClassForm sessionId="s1" classGroup={CLASS} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /stream/i }));
    expect(screen.getByRole('option', { name: 'Science' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired' })).not.toBeInTheDocument();
  });

  it('places the class’s students with no stream when it gets one', async () => {
    render(<ClassForm sessionId="s1" classGroup={CLASS} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /stream/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Science' }));
    expect(
      screen.getByLabelText(/Also put the 2 students in this class with no stream in Science/),
    ).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ defaultStreamId: 'st1', placeStudentsWithoutStream: true }),
    );
  });

  it('leaves them alone when unticked', async () => {
    render(<ClassForm sessionId="s1" classGroup={CLASS} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox', { name: /stream/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Science' }));
    await userEvent.click(screen.getByLabelText(/Also put the 2 students/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(update.mock.calls[0]![0]).not.toHaveProperty('placeStudentsWithoutStream');
  });
});
