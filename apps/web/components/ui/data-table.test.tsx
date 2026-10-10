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

  it('shows which rows are on screen out of the total, and offers rows per page', () => {
    const onPageSizeChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        page={2}
        pageCount={2}
        onPageChange={vi.fn()}
        total={36}
        pageSize={25}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByText('Showing 26–36 of 36')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('25');
  });

  it('keeps the rows-per-page choice reachable on a single page that a smaller size would split', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        total={36}
        pageSize={100}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Showing 1–36 of 36')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('opens a row through its own link when the row is clicked anywhere but a control', async () => {
    const followed = vi.fn();
    const linked: DataTableColumn<Row>[] = [
      ...columns,
      {
        id: 'view',
        header: '',
        cell: (row) => (
          <a
            href={`/r/${row.id}`}
            onClick={(event) => {
              event.preventDefault();
              followed(row.id);
            }}
          >
            View
          </a>
        ),
      },
    ];
    render(
      <DataTable
        columns={linked}
        rows={rows}
        getRowId={(r) => r.id}
        getRowHref={(r) => `/r/${r.id}`}
      />,
    );
    await userEvent.click(screen.getByText('Bo'));
    expect(followed).toHaveBeenCalledTimes(1);
    expect(followed).toHaveBeenCalledWith('2');
    // Clicking the link itself follows it once, not twice.
    followed.mockReset();
    await userEvent.click(screen.getAllByRole('link', { name: 'View' })[0]!);
    expect(followed).toHaveBeenCalledTimes(1);
  });
});
