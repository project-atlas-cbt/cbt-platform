import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportDialog } from './export-dialog';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiClient: {
    POST: vi.fn(),
    GET: vi.fn(),
  },
  resolveApiOrigin: () => 'http://localhost:3001',
  toApiError: (err: unknown, _status: number, fallback: string) =>
    new Error(typeof err === 'object' && err && 'message' in err ? String(err.message) : fallback),
  // `@/lib/reports/queries` imports `unwrap` from `@/lib/api`; without it the
  // export mutation and job-polling query reject before resolving (the same
  // shim export-progress.test.tsx added in B19).
  unwrap: async (resultPromise: Promise<{ data?: unknown }>) => (await resultPromise).data,
}));

const mockPost = vi.mocked(apiClient.POST);
const mockGet = vi.mocked(apiClient.GET);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog with available dataset types for School Admin', () => {
    renderWithClient(<ExportDialog open={true} onOpenChange={vi.fn()} role="SCHOOL_ADMIN" />);

    expect(screen.getByText(/Export Data/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dataset to Export/i)).toBeInTheDocument();
  });

  it('filters out staff directory export for TEACHER role', () => {
    renderWithClient(<ExportDialog open={true} onOpenChange={vi.fn()} role="TEACHER" />);

    // Default is EXAM_RESULTS
    expect(screen.getAllByText(/Exam Results & Marks/i).length).toBeGreaterThan(0);
    // Teacher cannot export Staff directory
    expect(screen.queryByText(/Teaching Staff Directory/i)).not.toBeInTheDocument();
  });

  it('shows error if required examId is missing on EXAM_RESULTS submit', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ExportDialog
        open={true}
        onOpenChange={vi.fn()}
        role="SCHOOL_ADMIN"
        initialType="EXAM_RESULTS"
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Generate CSV/i });
    await user.click(submitBtn);

    expect(screen.getByText(/Choose an exam to export/i)).toBeInTheDocument();
  });

  it('submits export request with scope and renders progress view', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      data: {
        id: 'job-123',
        status: 'PENDING',
        type: 'EXAM_RESULTS',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        rowCount: 0,
      },
      response: new Response(null, { status: 202 }),
    });

    mockGet.mockResolvedValue({
      data: {
        id: 'job-123',
        status: 'PROCESSING',
        type: 'EXAM_RESULTS',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        rowCount: 0,
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(
      <ExportDialog
        open={true}
        onOpenChange={vi.fn()}
        role="SCHOOL_ADMIN"
        initialType="EXAM_RESULTS"
        initialScope={{ examId: 'exam-xyz' }}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Generate CSV/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/exports', {
        body: {
          type: 'EXAM_RESULTS',
          scope: { examId: 'exam-xyz' },
        },
      });
    });

    // Should transition to showing progress
    await waitFor(() => {
      expect(screen.getByText(/Export in Progress/i)).toBeInTheDocument();
    });
  });

  describe('pickers instead of raw ID boxes', () => {
    const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });
    const job = {
      id: 'job-1',
      status: 'PENDING',
      type: 'STUDENTS',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      rowCount: 0,
    };

    function routeGets(routes: Record<string, unknown>) {
      mockGet.mockImplementation(((path: string) =>
        Promise.resolve(ok(routes[path] ?? job))) as never);
      mockPost.mockResolvedValue({ data: job, response: new Response(null, { status: 202 }) });
    }

    it('lets a School Admin pick an exam by typing its title', async () => {
      const user = userEvent.setup();
      routeGets({
        '/exams': {
          exams: [
            {
              id: 'exam-maths',
              title: 'First Term Mathematics',
              subjectName: 'Mathematics',
              classes: [{ className: 'JSS1A' }],
              termName: 'First Term',
              sessionName: '2026/2027',
            },
            {
              id: 'exam-eng',
              title: 'First Term English',
              subjectName: 'English',
              classes: [{ className: 'JSS1B' }],
              termName: 'First Term',
              sessionName: '2026/2027',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
        },
      });
      renderWithClient(
        <ExportDialog open onOpenChange={vi.fn()} role="SCHOOL_ADMIN" initialType="EXAM_RESULTS" />,
      );

      expect(screen.queryByPlaceholderText(/uuid|019551a0/i)).not.toBeInTheDocument();
      await user.type(screen.getByRole('combobox', { name: 'Exam' }), 'engl');
      await user.click(await screen.findByRole('option', { name: /First Term English/ }));
      await user.click(screen.getByRole('button', { name: /Generate CSV/i }));

      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/exports', {
          body: { type: 'EXAM_RESULTS', scope: { examId: 'exam-eng' } },
        }),
      );
    });

    it('lists the current session classes; typing "J" offers the J classes', async () => {
      const user = userEvent.setup();
      routeGets({
        '/academics/context': { session: { id: 'sess-1', name: '2026/2027', status: 'CURRENT' } },
        '/academics/classes': {
          classes: [
            { id: 'c-ss1', name: 'SS1A', status: 'ACTIVE', departmentId: null },
            { id: 'c-jss2', name: 'JSS2A', status: 'ACTIVE', departmentId: null },
            { id: 'c-jss1', name: 'JSS1A', status: 'ACTIVE', departmentId: null },
          ],
        },
      });
      renderWithClient(
        <ExportDialog
          open
          onOpenChange={vi.fn()}
          role="SCHOOL_ADMIN"
          initialType="STUDENTS"
          lockType
        />,
      );

      await user.type(screen.getByRole('combobox', { name: /Class/ }), 'J');
      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['JSS1A', 'JSS2A']);
      await user.click(options[0]!);
      await user.click(screen.getByRole('button', { name: /Generate CSV/i }));

      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/exports', {
          body: { type: 'STUDENTS', scope: { classId: 'c-jss1' } },
        }),
      );
      expect(mockGet).toHaveBeenCalledWith('/academics/classes', {
        params: { query: { academicSessionId: 'sess-1' } },
      });
    });

    it('leaves the class blank for a whole-school export', async () => {
      const user = userEvent.setup();
      routeGets({ '/academics/context': { session: null }, '/academics/classes': { classes: [] } });
      renderWithClient(
        <ExportDialog
          open
          onOpenChange={vi.fn()}
          role="SCHOOL_ADMIN"
          initialType="STUDENTS"
          lockType
        />,
      );
      await user.click(screen.getByRole('button', { name: /Generate CSV/i }));
      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/exports', { body: { type: 'STUDENTS' } }),
      );
    });

    it('offers a teacher only their own classes, subjects and levels', async () => {
      const user = userEvent.setup();
      routeGets({
        '/academics/context': { session: { id: 'sess-1', name: '2026/2027', status: 'CURRENT' } },
        '/teachers/me/assignments': {
          assignments: [
            {
              academicSessionId: 'sess-1',
              classId: 'c-jss1',
              className: 'JSS1A',
              level: 'JSS1',
              subjectId: 's-math',
              subjectName: 'Mathematics',
            },
            {
              academicSessionId: 'sess-1',
              classId: 'c-jss2',
              className: 'JSS2A',
              level: 'JSS2',
              subjectId: 's-math',
              subjectName: 'Mathematics',
            },
            {
              academicSessionId: 'old',
              classId: 'c-old',
              className: 'JSS3Z',
              level: 'JSS3',
              subjectId: 's-bio',
              subjectName: 'Biology',
            },
          ],
        },
      });
      renderWithClient(
        <ExportDialog
          open
          onOpenChange={vi.fn()}
          role="TEACHER"
          initialType="QUESTION_BANK"
          lockType
        />,
      );

      await user.click(screen.getByRole('combobox', { name: 'Subject' }));
      // Biology appears because the subject list is not session-limited, but
      // levels come only from matching assignments.
      await user.click(await screen.findByRole('option', { name: 'Mathematics' }));
      await user.click(screen.getByRole('combobox', { name: 'Class Level' }));
      const levels = await screen.findAllByRole('option');
      expect(levels.map((o) => o.textContent)).toEqual(['JSS1', 'JSS2']);
      await user.click(levels[1]!);
      await user.click(screen.getByRole('button', { name: /Generate CSV/i }));

      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/exports', {
          body: { type: 'QUESTION_BANK', scope: { subjectId: 's-math', level: 'JSS2' } },
        }),
      );
      // Teachers cannot read the school-wide lists.
      expect(mockGet).not.toHaveBeenCalledWith('/academics/subjects', expect.anything());
    });

    it('fills in the department an HOD heads', async () => {
      const user = userEvent.setup();
      routeGets({
        '/academics/departments': {
          departments: [
            { id: 'd-sci', name: 'Sciences', code: 'SCI', status: 'ACTIVE', headedByMe: true },
            { id: 'd-art', name: 'Arts', code: 'ART', status: 'ACTIVE', headedByMe: false },
          ],
        },
      });
      renderWithClient(
        <ExportDialog open onOpenChange={vi.fn()} role="HOD" initialType="TEACHERS" lockType />,
      );

      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Department' })).toHaveValue('Sciences'),
      );
      await user.click(screen.getByRole('button', { name: /Generate CSV/i }));
      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith('/exports', {
          body: { type: 'TEACHERS', scope: { departmentId: 'd-sci' } },
        }),
      );
    });

    it('shows the exam title, not its ID, when opened from an exam', async () => {
      routeGets({ '/exams/{id}': { id: 'exam-1', title: 'Mid-term Physics' } });
      renderWithClient(
        <ExportDialog
          open
          onOpenChange={vi.fn()}
          role="SCHOOL_ADMIN"
          initialType="EXAM_RESULTS"
          initialScope={{ examId: 'exam-1' }}
          lockType
        />,
      );
      expect(await screen.findByText('Mid-term Physics')).toBeInTheDocument();
      expect(screen.queryByText('exam-1')).not.toBeInTheDocument();
    });
  });
});
