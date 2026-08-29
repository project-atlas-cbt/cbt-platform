import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function errorEnvelope() {
  return Promise.resolve({
    error: {
      error: {
        code: 'IMPORT_ALREADY_CONFIRMED',
        message: 'This import has already been confirmed.',
        retryable: false,
        correlationId: 'corr-1',
      },
    },
    response: new Response(null, { status: 409 }),
  } as never);
}

function makeFile(name: string): File {
  const file = new File(['x'], name, { type: 'text/csv' });
  Object.defineProperty(file, 'size', { value: 2048 });
  return file;
}

function jobPayload(id: string, status: string) {
  return {
    id,
    type: 'STUDENTS',
    status,
    targetAcademicSessionId: 'sess1',
    templateVersion: 1,
    totalRows: 10,
    validRows: 8,
    invalidRows: 2,
    committedRows: 0,
    failedRows: 0,
    failureReason: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    createdAt: new Date().toISOString(),
    rows: [],
    rowsTotal: 0,
    rowsPage: 1,
    rowsPageSize: 100,
  };
}

/**
 * Regression coverage for two bugs this session's review found in
 * `useImportFlow`'s `confirm`/`cancel`:
 *
 * 1. `confirm()` awaited `confirmImport.mutateAsync` with no try/catch, so a
 *    failed confirm was an unhandled promise rejection (`confirm()` is
 *    always invoked as `void actions.confirm()`).
 * 2. `cancel()` never reset `confirmImport`'s own mutation state, so a
 *    *different* job reaching `validated` right after a prior job's failed
 *    confirm could render that stale error before the new job had ever
 *    attempted one.
 */
describe('useImportFlow — confirm failure handling', () => {
  const jobStatuses = new Map<string, string>();

  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    jobStatuses.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    let createCount = 0;

    mockGet.mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
        if (path === '/imports/{id}') {
          const id = options?.params?.path?.id ?? 'unknown';
          return ok(jobPayload(id, jobStatuses.get(id) ?? 'VALIDATED'));
        }
        return ok({});
      },
    );

    mockPost.mockImplementation(
      (path: string, options?: { params?: { path?: { id?: string } } }) => {
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
          createCount += 1;
          const id = createCount === 1 ? 'job-a' : 'job-b';
          jobStatuses.set(id, 'VALIDATED');
          return ok(jobPayload(id, 'PENDING_VALIDATION'));
        }
        if (path === '/imports/{id}/confirm') {
          const id = options?.params?.path?.id;
          if (id === 'job-a') return errorEnvelope();
          return ok(jobPayload(id ?? 'job-b', 'IMPORTING'));
        }
        return ok({});
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never produces an unhandled promise rejection when confirm fails', async () => {
    const onUnhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="STUDENTS" goToDirectoryHref="/school/people/students" />
      </QueryClientProvider>,
    );

    await userEvent.upload(
      screen.getByLabelText(/choose a file to import/i),
      makeFile('students.csv'),
    );

    const confirmButton = await screen.findByRole('button', { name: /import 8 valid rows/i });
    await userEvent.click(confirmButton);

    expect(await screen.findByText(/already been confirmed/i)).toBeInTheDocument();

    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it('does not carry a previous job’s confirm error over to a new import', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="STUDENTS" goToDirectoryHref="/school/people/students" />
      </QueryClientProvider>,
    );

    // Job A: confirm fails, error is shown.
    await userEvent.upload(
      screen.getByLabelText(/choose a file to import/i),
      makeFile('students-a.csv'),
    );
    const firstConfirm = await screen.findByRole('button', { name: /import 8 valid rows/i });
    await userEvent.click(firstConfirm);
    expect(await screen.findByText(/already been confirmed/i)).toBeInTheDocument();

    // Cancel and start a fresh import — a different job, which has never
    // attempted a confirm of its own.
    await userEvent.click(screen.getByRole('button', { name: /cancel and fix the file/i }));
    await act(async () => {
      // `cancel()` clears the URL param synchronously via the mocked
      // `replace`; flush the resulting re-render.
    });

    await userEvent.upload(
      screen.getByLabelText(/choose a file to import/i),
      makeFile('students-b.csv'),
    );
    await screen.findByRole('button', { name: /import 8 valid rows/i });

    expect(screen.queryByText(/already been confirmed/i)).not.toBeInTheDocument();
  });
});
