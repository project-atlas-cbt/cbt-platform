import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTeacherMyAssignments } from '@/lib/analytics';
import { MyClassesView } from './my-classes-view';

vi.mock('@/lib/academics/queries', () => ({
  useMyFormClasses: vi.fn(() => ({ isPending: false, data: { classes: [] } })),
  useClassRegistrationGrid: vi.fn(() => ({ isPending: true })),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useSaveClassRegistrations: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useTeacherMyAssignments: vi.fn(),
  };
});

describe('MyClassesView', () => {
  it('renders teacher assigned classes with levels and enrolled subjects', () => {
    vi.mocked(useTeacherMyAssignments).mockReturnValue({
      data: {
        assignments: [
          {
            assignmentId: 'asg-1',
            classId: 'cls-1',
            className: 'SS1 Gold',
            subjectId: 'sub-1',
            subjectName: 'Further Mathematics',
            level: 'SS1',
            arm: 'Gold',
          },
          {
            assignmentId: 'asg-2',
            classId: 'cls-1',
            className: 'SS1 Gold',
            subjectId: 'sub-2',
            subjectName: 'Physics',
            level: 'SS1',
            arm: 'Gold',
          },
        ],
      },
      isPending: false,
    } as never);

    render(<MyClassesView />);

    expect(screen.getByText('My Classes')).toBeInTheDocument();
    expect(screen.getByText('SS1 Gold')).toBeInTheDocument();
    // Level and Arm are rendered in separate span elements
    expect(screen.getByText('SS1')).toBeInTheDocument();
    expect(screen.getByText('Arm Gold')).toBeInTheDocument();
    expect(screen.getByText('Further Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Physics')).toBeInTheDocument();

    const viewClassLink = screen.getByRole('link', { name: /view class dashboard/i });
    expect(viewClassLink).toHaveAttribute('href', '/teacher/my-classes/cls-1');
  });

  it('renders calm empty state when teacher has no class assignments', () => {
    vi.mocked(useTeacherMyAssignments).mockReturnValue({
      data: { assignments: [] },
      isPending: false,
    } as never);

    render(<MyClassesView />);

    expect(screen.getByText('No classes assigned')).toBeInTheDocument();
  });
});
