import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  id: string;
  name: string;
  score: number;
}

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, sortable: true },
  { id: 'score', header: 'Score', cell: (row) => row.score, align: 'right' },
];
const rows: Row[] = [
  { id: '1', name: 'Ada', score: 90 },
  { id: '2', name: 'Bo', score: 70 },
];

describe('DataTable', () => {
  it('renders rows with real table semantics (default state)', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
  });

  it('renders a loading state as skeleton placeholder rows, not real data', () => {
    render(<DataTable columns={columns} rows={[]} getRowId={(r) => r.id} isLoading />);
    expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no rows and it is not loading', () => {
    render(<DataTable columns={columns} rows={[]} getRowId={(r) => r.id} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders a custom empty state when provided', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        emptyState={<p>No students match your filter.</p>}
      />,
    );
    expect(screen.getByText('No students match your filter.')).toBeInTheDocument();
  });

  it('calls onSortChange when a sortable column header is clicked', async () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'asc' });
  });
});
