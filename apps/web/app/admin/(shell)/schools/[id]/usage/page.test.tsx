import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolUsagePage from './page';
import { useSchool } from '@/lib/platform/queries';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/lib/platform/queries', () => ({ useSchool: vi.fn() }));

const mockUseSchool = vi.mocked(useSchool);

describe('SchoolUsagePage', () => {
  it('renders the four usage tiles from real persisted counts', () => {
    mockUseSchool.mockReturnValue({
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: { id: 's1', usage: { students: 12, teachers: 4, exams: 9, attempts: 31 } },
    } as never);
    render(<SchoolUsagePage />);

    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Teachers')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Exams')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Attempts')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('no longer ships the stale "exams and attempts don’t exist yet" note', () => {
    mockUseSchool.mockReturnValue({
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: { id: 's1', usage: { students: 0, teachers: 0, exams: 0, attempts: 0 } },
    } as never);
    render(<SchoolUsagePage />);
    expect(screen.queryByText(/exams and attempts don.t exist yet/i)).not.toBeInTheDocument();
  });
});
