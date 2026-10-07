import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useClassAnalytics, useClassStudents, useTeacherMyAssignments } from '@/lib/analytics';
import { ClassDetailView } from './class-detail-view';

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useClassAnalytics: vi.fn(),
    useClassStudents: vi.fn(),
    useTeacherMyAssignments: vi.fn(),
  };
});

const assignment = (subjectId: string, subjectName: string, classId = 'class-1') => ({
  classId,
  className: 'JSS 1A',
  level: 'JSS1',
  arm: 'A',
  subjectId,
  subjectName,
});

function setup(assignments: ReturnType<typeof assignment>[]) {
  vi.mocked(useTeacherMyAssignments).mockReturnValue({
    data: { assignments },
    isPending: false,
  } as never);
  vi.mocked(useClassAnalytics).mockReturnValue({
    data: { averagePercentage: 61.5, passRate: 70, participation: { completionRate: 90 } },
    isPending: false,
    isError: false,
  } as never);
  vi.mocked(useClassStudents).mockReturnValue({
    data: { students: [] },
    isPending: false,
  } as never);
}

describe('ClassDetailView (P2-23)', () => {
  it("asks for the teacher's subject in this class and never the class record", () => {
    setup([assignment('sub-maths', 'Mathematics'), assignment('sub-eng', 'English', 'class-2')]);
    render(<ClassDetailView classId="class-1" />);

    expect(useClassAnalytics).toHaveBeenCalledWith(
      'class-1',
      { subjectId: 'sub-maths' },
      { enabled: true },
    );
    expect(screen.getByRole('heading', { name: 'JSS 1A' })).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('does not ask for analytics when the teacher has no subject in the class', () => {
    setup([assignment('sub-eng', 'English', 'class-2')]);
    render(<ClassDetailView classId="class-1" />);

    expect(useClassAnalytics).toHaveBeenLastCalledWith(
      'class-1',
      { subjectId: undefined },
      { enabled: false },
    );
    expect(screen.getByText(/don.t teach a subject in this class/)).toBeInTheDocument();
  });
});
