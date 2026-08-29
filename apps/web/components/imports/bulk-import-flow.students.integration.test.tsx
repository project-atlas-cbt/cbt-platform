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
  usePathname: () => '/school/people/students/import',
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
 * The roadmap's own `IMP-01` flow, proven end to end against mocked HTTP
 * (mocking only the boundary, driving real components — matching
 * `resumability.integration.test.tsx`'s established technique): upload →
 * validate → review → confirm → import → summary, for `STUDENTS`. The
 * VALIDATING→VALIDATED transition is proven by directly asking the
 * `QueryClient` to refetch (simulating "a poll happened") rather than
 * advancing `refetchInterval`'s real timer — `refetchInterval` itself is
 * TanStack Query's own already-tested scheduling mechanism; what this test
 * proves is that this app's own code reacts correctly once new data
 * arrives, which is the same effect a real elapsed interval would produce.
 */
describe('BulkImportFlow — STUDENTS happy path (F8)', () => {
  let jobStatus: 'VALIDATING' | 'VALIDATED' | 'COMPLETED' = 'VALIDATING';

  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    jobStatus = 'VALIDATING';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    mockGet.mockImplementation((path: string) => {
      if (path === '/imports/{id}') {
        return ok({
          id: 'job-students-1',
          type: 'STUDENTS',
          status: jobStatus,
          targetAcademicSessionId: 'sess1',
          templateVersion: 1,
          totalRows: 100,
          validRows: 90,
          invalidRows: 10,
          committedRows: jobStatus === 'COMPLETED' ? 90 : 0,
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
      if (path === '/imports/upload-target') {
        return ok({
          mediaAssetId: 'media-1',
          uploadUrl: 'https://storage.example/upload/media-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (path === '/imports/upload-target/{id}/complete') {
        return ok({
          id: 'media-1',
          status: 'READY',
          sniffedMimeType: 'text/csv',
          width: null,
          height: null,
          rejectionReason: null,
        });
      }
      if (path === '/imports/students') {
        return ok({
          id: 'job-students-1',
          type: 'STUDENTS',
          status: 'PENDING_VALIDATION',
          targetAcademicSessionId: 'sess1',
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
          id: 'job-students-1',
          type: 'STUDENTS',
          status: 'IMPORTING',
          targetAcademicSessionId: 'sess1',
          templateVersion: 1,
          totalRows: 100,
          validRows: 90,
          invalidRows: 10,
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

  it('walks upload → validate → review → confirm → summary, calling every real route in order', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="STUDENTS" goToDirectoryHref="/school/people/students" />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText(/choose a file to import/i);
    await userEvent.upload(input, makeFile('students.csv', 2048));

    // Upload sequence: request → raw PUT → complete → create the job.
    await screen.findByText('Validating your file…');
    expect(mockPost).toHaveBeenCalledWith('/imports/upload-target', {
      body: { filename: 'students.csv', declaredMimeType: 'text/csv', declaredSizeBytes: 2048 },
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/upload/media-1',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/upload-target/{id}/complete',
      expect.objectContaining({ params: { path: { id: 'media-1' } } }),
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/students',
      expect.objectContaining({ body: { mediaAssetId: 'media-1' } }),
    );
    // DoD item 11's mechanism: the created job's id lands in the URL.
    expect(replace).toHaveBeenCalledWith('/school/people/students/import?job=job-students-1', {
      scroll: false,
    });

    // Simulate a poll: the job has since finished validating.
    jobStatus = 'VALIDATED';
    await act(async () => {
      await client.refetchQueries({ queryKey: ['imports', 'jobs'], type: 'active' });
    });

    // DoD item 3 & 6 — the review stage (the exact wording is proven in
    // isolation by validation-summary.test.tsx).
    const confirmButton = await screen.findByRole('button', { name: /import 90 valid rows/i });
    await userEvent.click(confirmButton);
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/{id}/confirm',
      expect.objectContaining({ params: { path: { id: 'job-students-1' } } }),
    );

    // Confirm's own onSuccess invalidates the job query, which refetches and
    // — per this test's mocked GET — now reports COMPLETED.
    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText(/90 of 100 students imported/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute(
      'href',
      '/school/people/students',
    );
  });
});
