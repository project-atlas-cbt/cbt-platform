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

    expect(screen.getByText(/Exam ID is required for this export/i)).toBeInTheDocument();
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
});
