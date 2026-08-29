import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkImportFlow } from './bulk-import-flow';
import { apiClient } from '@/lib/api';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/school/people/students/import',
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

/**
 * DoD item 11 — "navigating away and returning restores a validated-but-
 * unconfirmed import." Proven the same way F4's own
 * `resumability.integration.test.tsx` proves the equivalent onboarding
 * requirement: a genuinely fresh `QueryClient` (nothing survives from any
 * prior render, exactly like a real closed-and-reopened browser tab), with
 * the job id present only via the URL — resumption can only be working
 * because the server (the mocked `GET /imports/:id`) reports the real
 * state, never because a client-side cache happened to still be warm.
 */
describe('useImportFlow resilience (DoD item 11)', () => {
  it('resumes directly into the review stage from a URL-persisted job id', async () => {
    searchParams = new URLSearchParams('job=job-resume-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/imports/{id}') {
        return ok({
          id: 'job-resume-1',
          type: 'STUDENTS',
          status: 'VALIDATED',
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
          rows: [],
          rowsTotal: 0,
          rowsPage: 1,
          rowsPageSize: 100,
        });
      }
      return ok({});
    });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="STUDENTS" goToDirectoryHref="/school/people/students" />
      </QueryClientProvider>,
    );

    // Straight into the review stage — never the idle upload UI.
    expect(
      await screen.findByRole('button', { name: /import 90 valid rows/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/drag a file here/i)).not.toBeInTheDocument();
  });

  it('resumes into the completed summary when the job finished while the tab was closed', async () => {
    searchParams = new URLSearchParams('job=job-resume-2');
    mockGet.mockImplementation((path: string) => {
      if (path === '/imports/{id}') {
        return ok({
          id: 'job-resume-2',
          type: 'STUDENTS',
          status: 'COMPLETED',
          targetAcademicSessionId: 'sess1',
          templateVersion: 1,
          totalRows: 50,
          validRows: 48,
          invalidRows: 2,
          committedRows: 48,
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

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <BulkImportFlow type="STUDENTS" goToDirectoryHref="/school/people/students" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Import complete')).toBeInTheDocument();
  });
});
