import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuth } from '@/lib/auth';
import { useExamsList, useQuestionCounts, useTeacherMyAssignments } from '@/lib/analytics';
import { TeacherDashboard } from './teacher-dashboard';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useTeacherMyAssignments: vi.fn(),
    useQuestionCounts: vi.fn(),
    useExamsList: vi.fn(),
  };
});

describe('TeacherDashboard', () => {
  it('renders personalized greeting, assigned subjects, classes, and question authoring stats', () => {
    vi.mocked(useAuth).mockReturnValue({
      me: {
        user: {
          id: 'usr-1',
          displayName: 'Ada Lovelace',
          firstName: 'Ada',
          lastName: 'Lovelace',
          status: 'ACTIVE',
        },
      },
    } as never);

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
            classId: 'cls-2',
            className: 'SS2 Diamond',
            subjectId: 'sub-1',
            subjectName: 'Further Mathematics',
            level: 'SS2',
            arm: 'Diamond',
          },
        ],
      },
      isPending: false,
    } as never);

    vi.mocked(useQuestionCounts).mockReturnValue({
      data: { submitted: 10, underReview: 5, approved: 33 },
      isPending: false,
    } as never);

    vi.mocked(useExamsList).mockReturnValue({
      data: { exams: [] },
      isPending: false,
    } as never);

    render(<TeacherDashboard />);

    expect(screen.getByText(/Welcome back, Ada Lovelace/i)).toBeInTheDocument();
    expect(screen.getByText('Further Mathematics')).toBeInTheDocument();
    expect(screen.getByText('SS1 Gold')).toBeInTheDocument();
    expect(screen.getByText('SS2 Diamond')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument(); // Approved questions
  });
});
