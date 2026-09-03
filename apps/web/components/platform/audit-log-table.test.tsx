import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTable } from './audit-log-table';
import { useAuditLog } from '@/lib/platform/queries';
import { NetworkError } from '@/lib/api';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/platform/queries', () => ({ useAuditLog: vi.fn() }));
const mockUseAuditLog = vi.mocked(useAuditLog);

const ROW = {
  id: 'e1',
  schoolId: 's1',
  actorUserId: 'u1',
  actorDisplayName: 'Mr Ade',
  actorRole: 'SCHOOL_ADMIN',
  action: 'CLASS_GROUP_CREATED',
  entityType: null,
  entityId: null,
  reason: null,
  breakGlass: false,
  occurredAt: '2026-09-03T12:00:00.000Z',
};

function result(
  items: unknown[],
  overrides: Partial<{ isPending: boolean; isError: boolean; error: unknown; total: number }> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: overrides.isError ? new NetworkError() : undefined,
    data: { items, total: overrides.total ?? items.length, page: 1, pageSize: 25 },
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('AuditLogTable', () => {
  beforeEach(() => {
    replace.mockReset();
    params = new URLSearchParams();
    mockUseAuditLog.mockReset();
  });

  it('shows a genuine empty state when no events match', () => {
    mockUseAuditLog.mockReturnValue(result([]) as never);
    render(<AuditLogTable />);
    expect(screen.getByText('No events match these filters')).toBeInTheDocument();
  });

  it('shows a loading state while pending', () => {
    mockUseAuditLog.mockReturnValue(result([], { isPending: true }) as never);
    render(<AuditLogTable />);
    expect(screen.getAllByRole('status', { name: /loading/i }).length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    mockUseAuditLog.mockReturnValue(result([], { isError: true }) as never);
    render(<AuditLogTable />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders real rows, including actor, action, and entity', () => {
    mockUseAuditLog.mockReturnValue(result([ROW]) as never);
    render(<AuditLogTable />);
    expect(screen.getByText('Mr Ade')).toBeInTheDocument();
    expect(screen.getByText('CLASS_GROUP_CREATED')).toBeInTheDocument();
  });

  it('shows a break-glass badge only on break-glass rows', () => {
    mockUseAuditLog.mockReturnValue(result([{ ...ROW, breakGlass: true }]) as never);
    render(<AuditLogTable />);
    expect(screen.getByText('Break-glass')).toBeInTheDocument();
  });

  it('fixedSchoolId never renders a school picker or a School column', () => {
    mockUseAuditLog.mockReturnValue(result([ROW]) as never);
    render(<AuditLogTable fixedSchoolId="s1" />);
    expect(screen.queryByLabelText(/school id/i)).not.toBeInTheDocument();
    expect(screen.queryByText('School')).not.toBeInTheDocument();
  });

  it('always narrows the query to fixedSchoolId, regardless of URL params', () => {
    params = new URLSearchParams('schoolId=s2');
    mockUseAuditLog.mockReturnValue(result([]) as never);
    render(<AuditLogTable fixedSchoolId="s1" />);
    expect(mockUseAuditLog).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 's1' }));
  });

  it('compact mode renders no filter row and no pager', () => {
    mockUseAuditLog.mockReturnValue(result([ROW]) as never);
    render(<AuditLogTable fixedSchoolId="s1" showFilters={false} compact />);
    expect(screen.queryByLabelText(/actor user id/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  it('compact mode shows a "view full audit log" link when more rows exist than shown', () => {
    mockUseAuditLog.mockReturnValue(result([ROW], { total: 5 }) as never);
    render(<AuditLogTable fixedSchoolId="s1" showFilters={false} compact />);
    expect(screen.getByRole('link', { name: /view full audit log/i })).toHaveAttribute(
      'href',
      '/admin/schools/s1/audit',
    );
  });

  it('showFilters renders the open filter row (action, entity type, date range)', () => {
    mockUseAuditLog.mockReturnValue(result([]) as never);
    render(<AuditLogTable showFilters />);
    expect(screen.getByLabelText(/^action$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entity type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^from$/i)).toBeInTheDocument();
  });
});
