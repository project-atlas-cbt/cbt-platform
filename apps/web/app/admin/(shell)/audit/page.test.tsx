import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlatformAuditPage from './page';
import { AuditLogTable } from '@/components/platform/audit-log-table';

vi.mock('@/components/platform/audit-log-table', () => ({
  AuditLogTable: vi.fn(() => <div data-testid="audit-log-table" />),
}));
const mockAuditLogTable = vi.mocked(AuditLogTable);

describe('PlatformAuditPage', () => {
  it('renders the open, cross-school audit table with filters enabled', () => {
    render(<PlatformAuditPage />);
    expect(screen.getByText('Audit & Security')).toBeInTheDocument();
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
    expect(mockAuditLogTable).toHaveBeenCalledWith(
      expect.objectContaining({ showFilters: true }),
      undefined,
    );
    expect(mockAuditLogTable.mock.calls[0]?.[0]).not.toHaveProperty('fixedSchoolId');
  });
});
