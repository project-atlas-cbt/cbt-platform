import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolExamsPage from './page';
import { useSchoolExams } from '@/lib/platform/queries';

let params: URLSearchParams;
let replace: ReturnType<typeof vi.fn>;

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's1' }),
  useSearchParams: () => params,
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/platform/queries', () => ({ useSchoolExams: vi.fn() }));

const mockUseSchoolExams = vi.mocked(useSchoolExams);

const EXAM_ROWS = {
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  data: {
    total: 2,
    exams: [
      {
        id: 'e1',
        title: 'Final Examination',
        examType: 'TERM',
        status: 'OPEN',
        subjectName: 'Mathematics',
        sessionName: '2026/2027',
        termName: 'Term 1',
        createdByName: 'Ada Lovelace',
        createdAt: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'e2',
        title: 'Midterm Mathematics',
        examType: 'CA_TEST',
        status: 'DRAFT',
        subjectName: 'Mathematics',
        sessionName: '2026/2027',
        termName: 'Term 1',
        createdByName: 'Ada Lovelace',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
};

describe('SchoolExamsPage', () => {
  beforeEach(() => {
    params = new URLSearchParams('');
    replace = vi.fn();
    mockUseSchoolExams.mockReturnValue(EXAM_ROWS as never);
  });

  it("lists the school's exams with subject, session/term, teacher, and status", () => {
    render(<SchoolExamsPage />);

    expect(screen.getByText('Final Examination')).toBeInTheDocument();
    expect(screen.getByText('TERM')).toBeInTheDocument();
    // Both fixture rows are Mathematics in the same session/term by the same
    // teacher — assert the repeated cells via the plural queries.
    expect(screen.getAllByText('Mathematics')).toHaveLength(2);
    expect(screen.getAllByText('2026/2027 · Term 1')).toHaveLength(2);
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
    // The status badge in the row (the "Open" *tab* is separate).
    expect(screen.getByRole('cell', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByText('2 exams at this school')).toBeInTheDocument();
  });

  it('applies the status filter tab into the URL and resets to page 1', async () => {
    render(<SchoolExamsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Open' }));
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/exams?status=OPEN');
  });

  it('reflects an already-applied status filter from the URL', () => {
    params = new URLSearchParams('status=OPEN');
    render(<SchoolExamsPage />);
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates pagination through the Next button', async () => {
    mockUseSchoolExams.mockReturnValue({
      ...EXAM_ROWS,
      data: { ...EXAM_ROWS.data, total: 40, exams: EXAM_ROWS.data.exams.slice(0, 1) },
    } as never);
    render(<SchoolExamsPage />);
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(replace).toHaveBeenCalledWith('/admin/schools/s1/exams?page=2');
  });

  it('distinguishes the empty state with and without a status filter', () => {
    mockUseSchoolExams.mockReturnValue({
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: { exams: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    const { unmount } = render(<SchoolExamsPage />);
    expect(screen.getByText('No exams have been built at this school yet')).toBeInTheDocument();
    unmount();

    params = new URLSearchParams('status=CLOSED');
    render(<SchoolExamsPage />);
    expect(screen.getByText('No exams match this status')).toBeInTheDocument();
  });
});
