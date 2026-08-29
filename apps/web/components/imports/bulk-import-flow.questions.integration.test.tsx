import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkImportFlow } from './bulk-import-flow';
import { apiClient } from '@/lib/api';

let searchParams = new URLSearchParams();
const replace = vi.fn((url: string) => {
  const qIndex = url.indexOf('?');
  searchParams = new URLSearchParams(qIndex === -1 ? '' : url.slice(qIndex + 1));
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/teacher/question-bank/import',
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type: 'text/csv' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

/**
 * Same shape as the STUDENTS/TEACHERS happy-path tests, adjusted for
 * QUESTIONS: the dedicated `/imports/questions/upload-target*` route pair
 * (B8's own reasoning — `questionBank.import`'s grant set, including
 * TEACHER, differs from `users.import.*`) and DoD item 10 — the completed
 * summary must clearly mark the imported rows as drafts pending review.
 */
describe('BulkImportFlow — QUESTIONS happy path (F8)', () => {
  let jobStatus: 'VALIDATING' | 'VALIDATED' | 'COMPLETED' = 'VALIDATING';

  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    jobStatus = 'VALIDATING';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    mockGet.mockImplementation((path: string) => {
      if (path === '/imports/{id}') {
        return ok({
          id: 'job-questions-1',
          type: 'QUESTIONS',
          status: jobStatus,
          targetAcademicSessionId: null,
          templateVersion: 1,
          totalRows: 10,
          validRows: 9,
          invalidRows: 1,
          committedRows: jobStatus === 'COMPLETED' ? 9 : 0,
          failedRows: 0,
          failureReason: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          createdAt: new Date().toISOString(),
          rows: [],
          rowsTotal: 0,
          rowsPage: 1,
          rowsPageSize: 100,
        });
      }
      return ok({});
    });

    mockPost.mockImplementation((path: string) => {
      if (path === '/imports/questions/upload-target') {
        return ok({
          mediaAssetId: 'media-3',
          uploadUrl: 'https://storage.example/upload/media-3',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (path === '/imports/questions/upload-target/{id}/complete') {
        return ok({
          id: 'media-3',
          status: 'READY',
          sniffedMimeType: 'text/csv',
          width: null,
          height: null,
          rejectionReason: null,
        });
      }
      if (path === '/imports/questions') {
        return ok({
          id: 'job-questions-1',
          type: 'QUESTIONS',
          status: 'PENDING_VALIDATION',
          targetAcademicSessionId: null,
          templateVersion: 1,
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          committedRows: 0,
          failedRows: 0,
          failureReason: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
      if (path === '/imports/{id}/confirm') {
        jobStatus = 'COMPLETED';
        return ok({
          id: 'job-questions-1',
          type: 'QUESTIONS',
          status: 'IMPORTING',
          targetAcademicSessionId: null,
          templateVersion: 1,
          totalRows: 10,
          validRows: 9,
          invalidRows: 1,
          committedRows: 0,
          failedRows: 0,
          failureReason: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
      return ok({});
    });
  });

  it('walks upload → validate → review → confirm → summary via the dedicated questions upload routes, ending in a drafts-pending-review summary', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="QUESTIONS" goToDirectoryHref="/teacher/question-bank" />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText(/choose a file to import/i);
    await userEvent.upload(input, makeFile('questions.csv', 2048));

    await screen.findByText('Validating your file…');
    expect(mockPost).toHaveBeenCalledWith('/imports/questions/upload-target', {
      body: { filename: 'questions.csv', declaredMimeType: 'text/csv', declaredSizeBytes: 2048 },
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/questions/upload-target/{id}/complete',
      expect.objectContaining({ params: { path: { id: 'media-3' } } }),
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/questions',
      expect.objectContaining({ body: { mediaAssetId: 'media-3' } }),
    );

    jobStatus = 'VALIDATED';
    await act(async () => {
      await client.refetchQueries({ queryKey: ['imports', 'jobs'], type: 'active' });
    });

    const confirmButton = await screen.findByRole('button', { name: /import 9 valid rows/i });
    await userEvent.click(confirmButton);

    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText(/9 of 10 questions imported/)).toBeInTheDocument();
    // DoD item 10 — imported questions are clearly marked as drafts requiring review.
    expect(screen.getByText('Draft — pending review')).toBeInTheDocument();
    expect(screen.getByText(/won.t appear in an exam until/i)).toBeInTheDocument();
  });
});
