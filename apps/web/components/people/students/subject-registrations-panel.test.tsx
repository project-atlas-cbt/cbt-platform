import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubjectRegistrationsPanel } from './subject-registrations-panel';
import { useStudentSubjectRegistrations } from '@/lib/people/queries';
import { useSaveClassRegistrations } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/people/queries', () => ({ useStudentSubjectRegistrations: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({ useSaveClassRegistrations: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const DATA = {
  enrollmentId: 'e1',
  classId: 'c1',
  className: 'SS1A',
  registrations: [
    {
      id: 'r1',
      studentEnrollmentId: 'e1',
      classSubjectId: 'cs-mth',
      subjectName: 'Mathematics',
      subjectCode: 'MTH',
      kind: 'COMPULSORY',
      choiceGroupName: null,
      status: 'REGISTERED',
      registeredAt: '2026-09-10T00:00:00Z',
      deregisteredAt: null,
    },
  ],
  availableOfferings: [
    {
      classSubjectId: 'cs-crs',
      subjectName: 'CRS',
      subjectCode: 'CRS',
      kind: 'ELECTIVE',
      choiceGroupName: 'Religion',
    },
  ],
  warnings: [{ choiceGroupId: 'g1', message: 'Religion: choose 1, 0 chosen.' }],
};

describe('SubjectRegistrationsPanel', () => {
  const mutateAsync = vi.fn();
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ changed: 1 });
    vi.mocked(useStudentSubjectRegistrations).mockReturnValue({
      isPending: false,
      isError: false,
      data: DATA,
    } as never);
    vi.mocked(useSaveClassRegistrations).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('lists every subject the class offers as a checklist and saves the ticks', async () => {
    vi.mocked(useHasPermission).mockReturnValue(true);
    render(<SubjectRegistrationsPanel studentProfileId="p1" />);
    expect(screen.getByText('SS1A: takes 1 of 2 subjects offered.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Compulsory' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Mathematics/ })).toBeChecked();
    expect(screen.getByText('Religion: choose 1, 0 chosen.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /CRS/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save subjects' }));
    expect(mutateAsync).toHaveBeenCalledWith([
      { enrollmentId: 'e1', classSubjectId: 'cs-crs', registered: true },
    ]);
  });

  it('is read-only without permission', () => {
    vi.mocked(useHasPermission).mockReturnValue(false);
    render(<SubjectRegistrationsPanel studentProfileId="p1" />);
    expect(screen.getByRole('checkbox', { name: /CRS/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save subjects' })).not.toBeInTheDocument();
  });
});
