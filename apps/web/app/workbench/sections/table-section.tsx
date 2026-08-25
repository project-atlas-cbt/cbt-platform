'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { Section } from '../section';

interface DemoStudent {
  id: string;
  name: string;
  studentId: string;
  status: 'active' | 'suspended';
  score: number;
}

const DEMO_ROWS: DemoStudent[] = [
  { id: '1', name: 'Adaeze Okafor', studentId: 'ST001', status: 'active', score: 87 },
  { id: '2', name: 'Chinedu Eze', studentId: 'ST002', status: 'active', score: 72 },
  { id: '3', name: 'Bola Adeyemi', studentId: 'ST003', status: 'suspended', score: 0 },
];

const columns: DataTableColumn<DemoStudent>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, sortable: true },
  { id: 'studentId', header: 'Student ID', cell: (row) => row.studentId },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <Badge status={row.status === 'active' ? 'success' : 'danger'}>
        {row.status === 'active' ? 'Active' : 'Suspended'}
      </Badge>
    ),
  },
  { id: 'score', header: 'Score', cell: (row) => row.score, align: 'right', sortable: true },
];

export function TableSection() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [mode, setMode] = useState<'data' | 'loading' | 'empty'>('data');

  const rows = useMemo(() => {
    if (mode !== 'data') return [];
    if (!sort) return DEMO_ROWS;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...DEMO_ROWS].sort((a, b) => {
      const av = a[sort.columnId as keyof DemoStudent];
      const bv = b[sort.columnId as keyof DemoStudent];
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }, [mode, sort]);

  return (
    <Section title="Table">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'data' ? 'primary' : 'secondary'}
          onClick={() => setMode('data')}
        >
          Default
        </Button>
        <Button
          size="sm"
          variant={mode === 'loading' ? 'primary' : 'secondary'}
          onClick={() => setMode('loading')}
        >
          Loading
        </Button>
        <Button
          size="sm"
          variant={mode === 'empty' ? 'primary' : 'secondary'}
          onClick={() => setMode('empty')}
        >
          Empty
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={setSort}
        isLoading={mode === 'loading'}
        caption="Demo student directory"
      />
    </Section>
  );
}
