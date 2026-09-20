import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportProgress } from './export-progress';
import { apiClient } from '@/lib/api';
import * as downloadModule from '@/lib/imports/use-import-download';

vi.mock('@/lib/api', () => ({
  apiClient: {
    GET: vi.fn(),
  },
  resolveApiOrigin: () => 'http://localhost:3001',
  toApiError: (err: unknown, _status: number, fallback: string) =>
    new Error(typeof err === 'object' && err && 'message' in err ? String(err.message) : fallback),
}));

vi.mock('@/lib/imports/use-import-download', () => ({
  downloadCsv: vi.fn().mockResolvedValue(undefined),
}));

const mockGet = vi.mocked(apiClient.GET);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ExportProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders processing state when job status is PROCESSING', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        status: 'PROCESSING',
        type: 'STUDENTS',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        rowCount: 0,
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<ExportProgress jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Processing dataset and compiling CSV/i)).toBeInTheDocument();
      expect(screen.getByText(/Generating CSV/i)).toBeInTheDocument();
    });
  });

  it('renders completed state with row count and download button', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'job-2',
        status: 'COMPLETED',
        type: 'EXAM_RESULTS',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        rowCount: 142,
        downloadUrl: '/v1/exports/job-2/download?token=abc',
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<ExportProgress jobId="job-2" />);

    await waitFor(() => {
      expect(screen.getByText(/Export completed successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/142 rows exported/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download CSV/i })).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /Download CSV/i });
    await user.click(downloadBtn);

    expect(downloadModule.downloadCsv).toHaveBeenCalledWith(
      expect.stringContaining('/v1/exports/job-2/download?token=abc'),
      expect.stringMatching(/exam_results-.*\.csv/),
      expect.any(String),
    );
  });

  it('renders failure message when export has failed', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'job-3',
        status: 'FAILED',
        type: 'CLASSES',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        rowCount: 0,
        failureReason: 'Database connection timeout during rendering.',
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<ExportProgress jobId="job-3" />);

    await waitFor(() => {
      expect(screen.getByText(/Export generation failed/i)).toBeInTheDocument();
      expect(screen.getByText(/Database connection timeout during rendering/i)).toBeInTheDocument();
    });
  });
});
