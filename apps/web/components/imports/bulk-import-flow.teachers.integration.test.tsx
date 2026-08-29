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
  usePathname: () => '/school/people/teachers/import',
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

/** Same shape as the STUDENTS happy-path test — see its own doc comment for
 * the "simulate a poll via a direct refetch" reasoning — adjusted for
 * TEACHERS: no `academicSessionId` on the create body (`targetAcademicSessionId`
 * is always `null` for a TEACHERS job). */
describe('BulkImportFlow — TEACHERS happy path (F8)', () => {
  let jobStatus: 'VALIDATING' | 'VALIDATED' | 'COMPLETED' = 'VALIDATING';

  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    jobStatus = 'VALIDATING';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    mockGet.mockImplementation((path: string) => {
      if (path === '/imports/{id}') {
        return ok({
          id: 'job-teachers-1',
          type: 'TEACHERS',
          status: jobStatus,
          targetAcademicSessionId: null,
          templateVersion: 1,
          totalRows: 20,
          validRows: 18,
          invalidRows: 2,
          committedRows: jobStatus === 'COMPLETED' ? 18 : 0,
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
          mediaAssetId: 'media-2',
          uploadUrl: 'https://storage.example/upload/media-2',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (path === '/imports/upload-target/{id}/complete') {
        return ok({
          id: 'media-2',
          status: 'READY',
          sniffedMimeType: 'text/csv',
          width: null,
          height: null,
          rejectionReason: null,
        });
      }
      if (path === '/imports/teachers') {
        return ok({
          id: 'job-teachers-1',
          type: 'TEACHERS',
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
          id: 'job-teachers-1',
          type: 'TEACHERS',
          status: 'IMPORTING',
          targetAcademicSessionId: null,
          templateVersion: 1,
          totalRows: 20,
          validRows: 18,
          invalidRows: 2,
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

  it('walks upload → validate → review → confirm → summary against /imports/teachers', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="TEACHERS" goToDirectoryHref="/school/people/teachers" />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText(/choose a file to import/i);
    await userEvent.upload(input, makeFile('teachers.csv', 2048));

    await screen.findByText('Validating your file…');
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/teachers',
      expect.objectContaining({ body: { mediaAssetId: 'media-2' } }),
    );
    expect(replace).toHaveBeenCalledWith('/school/people/teachers/import?job=job-teachers-1', {
      scroll: false,
    });

    jobStatus = 'VALIDATED';
    await act(async () => {
      await client.refetchQueries({ queryKey: ['imports', 'jobs'], type: 'active' });
    });

    const confirmButton = await screen.findByRole('button', { name: /import 18 valid rows/i });
    await userEvent.click(confirmButton);
    expect(mockPost).toHaveBeenCalledWith(
      '/imports/{id}/confirm',
      expect.objectContaining({ params: { path: { id: 'job-teachers-1' } } }),
    );

    expect(await screen.findByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText(/18 of 20 teachers imported/)).toBeInTheDocument();
  });
});
