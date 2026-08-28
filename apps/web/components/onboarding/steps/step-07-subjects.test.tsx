import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step07Subjects } from './step-07-subjects';
import { useDepartments, useSubjects } from '@/lib/onboarding/queries';
import { useCreateSubject } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useDepartments: vi.fn(), useSubjects: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateSubject: vi.fn() }));

describe('Step07Subjects', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useCreateSubject).mockReturnValue({ mutateAsync } as never);
    vi.mocked(useDepartments).mockReturnValue({
      data: { departments: [] },
      isPending: false,
    } as never);
  });

  it('shows an empty list when no subjects exist yet', () => {
    vi.mocked(useSubjects).mockReturnValue({ data: { subjects: [] }, isPending: false } as never);
    render(<Step07Subjects />);
    expect(screen.getByText(/no subjects added yet/i)).toBeInTheDocument();
  });

  it('creates a subject with no department by default', async () => {
    vi.mocked(useSubjects).mockReturnValue({ data: { subjects: [] }, isPending: false } as never);
    render(<Step07Subjects />);
    await userEvent.type(screen.getByLabelText(/subject name/i), 'Mathematics');
    await userEvent.type(screen.getByLabelText(/code/i), 'MTH');
    await userEvent.click(screen.getByRole('button', { name: /add subject/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ name: 'Mathematics', code: 'MTH' });
  });
});
