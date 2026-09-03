import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolActivityPage from './page';
import { AuditLogTable } from '@/components/platform/audit-log-table';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/components/platform/audit-log-table', () => ({
  AuditLogTable: vi.fn(() => <div data-testid="audit-log-table" />),
}));
const mockAuditLogTable = vi.mocked(AuditLogTable);

describe('SchoolActivityPage', () => {
  it('pins schoolId, disables filters, and renders in compact mode', () => {
    render(<SchoolActivityPage />);
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
    expect(mockAuditLogTable).toHaveBeenCalledWith(
      expect.objectContaining({ fixedSchoolId: 's1', showFilters: false, compact: true }),
      undefined,
    );
  });
});
