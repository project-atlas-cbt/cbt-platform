import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolAuditPage from './page';
import { AuditLogTable } from '@/components/platform/audit-log-table';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/components/platform/audit-log-table', () => ({
  AuditLogTable: vi.fn(() => <div data-testid="audit-log-table" />),
}));
const mockAuditLogTable = vi.mocked(AuditLogTable);

describe('SchoolAuditPage', () => {
  it('pins schoolId from the route param, with filters enabled', () => {
    render(<SchoolAuditPage />);
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
    expect(mockAuditLogTable).toHaveBeenCalledWith(
      expect.objectContaining({ showFilters: true, fixedSchoolId: 's1' }),
      undefined,
    );
  });
});
