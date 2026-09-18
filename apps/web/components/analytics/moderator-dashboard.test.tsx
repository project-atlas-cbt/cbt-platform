import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  useAcademicsContext,
  useClasses,
  useHods,
  useStudents,
  useTeachers,
} from '@/lib/academics/queries';
import { useImportJobs } from '@/lib/analytics';
import { ModeratorDashboard } from './moderator-dashboard';

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useHods: vi.fn(),
  useStudents: vi.fn(),
  useTeachers: vi.fn(),
}));

vi.mock('@/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    useImportJobs: vi.fn(),
  };
});

describe('ModeratorDashboard', () => {
  it('renders student, teacher, hod counts and operational guidance', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: {
        session: { id: 'ses-1', name: '2025/2026 Academic Session' },
        term: { id: 'term-1', name: 'First Term' },
      },
    } as never);

    vi.mocked(useStudents).mockReturnValue({ data: { total: 550 }, isPending: false } as never);
    vi.mocked(useTeachers).mockReturnValue({ data: { total: 40 }, isPending: false } as never);
    vi.mocked(useHods).mockReturnValue({ data: { total: 5 }, isPending: false } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: { classes: new Array(15) },
      isPending: false,
    } as never);
    vi.mocked(useImportJobs).mockReturnValue({
      data: { jobs: [] },
      isPending: false,
    } as never);

    render(<ModeratorDashboard />);

    expect(screen.getByText('Moderator Dashboard')).toBeInTheDocument();
    expect(screen.getByText('550')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Teacher Assignments')).toBeInTheDocument();
    expect(screen.getByText('Academic Structure')).toBeInTheDocument();
  });
});
