import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExamResultsTable, type StaffResultRow } from './exam-results-table';

const ROWS: StaffResultRow[] = [
  {
    id: 'result-1',
    studentName: 'Ada Bello',
    studentIdentifier: 'STU/2026/001',
    className: 'SS2A',
    state: 'FINAL',
    earnedMarks: 41,
    totalMarks: 50,
    percentage: 82,
    grade: 'A',
    withheld: false,
    withheldReason: null,
    voidedReason: null,
    finalizedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'result-2',
    studentName: 'Chidi Okoro',
    studentIdentifier: 'STU/2026/002',
    className: 'SS2A',
    state: 'VOIDED',
    earnedMarks: 0,
    totalMarks: 50,
    percentage: 0,
    grade: null,
    withheld: false,
    withheldReason: null,
    voidedReason: 'Attempt invalidated after malpractice review',
    finalizedAt: null,
  },
  {
    id: 'result-3',
    studentName: 'Ngozi Eze',
    studentIdentifier: 'STU/2026/003',
    className: null,
    state: 'ADJUSTED',
    earnedMarks: 30,
    totalMarks: 50,
    percentage: 60,
    grade: 'C',
    withheld: true,
    withheldReason: 'Pending script review',
    voidedReason: null,
    finalizedAt: '2026-09-01T10:05:00Z',
  },
];

function renderTable(overrides: Partial<Parameters<typeof ExamResultsTable>[0]> = {}) {
  return render(
    <ExamResultsTable
      rows={ROWS}
      isLoading={false}
      sort={null}
      onSortChange={vi.fn()}
      page={1}
      pageCount={1}
      onPageChange={vi.fn()}
      detailBasePath="/moderator/results/exam-1"
      hasFilters={false}
      {...overrides}
    />,
  );
}

describe('ExamResultsTable', () => {
  it('keeps voided results visible and shows the invalidation reason (ADR-0025)', () => {
    renderTable();
    expect(screen.getByText('Chidi Okoro')).toBeInTheDocument();
    expect(screen.getByText(/attempt invalidated after malpractice review/i)).toBeInTheDocument();
  });

  it('distinguishes a withheld result and shows its reason', () => {
    renderTable();
    expect(screen.getByText('Withheld')).toBeInTheDocument();
    expect(screen.getByText(/pending script review/i)).toBeInTheDocument();
  });

  /**
   * `RESULT_STATES` is `PROCESSING | FINAL | ADJUSTED | VOIDED`. `ADJUSTED`
   * must read differently from `FINAL`: a moderator looking at a disputed
   * script needs to see that the score was changed after finalisation.
   */
  it('labels each domain result state distinctly', () => {
    renderTable();
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(screen.getByText('Adjusted')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
  });

  /** `className` is nullable on `ResultListItemDto` — a result whose student
   *  has no current class enrolment is still listed. */
  it('renders a placeholder rather than a blank cell for a result with no class', () => {
    renderTable();
    expect(screen.getByText('Ngozi Eze')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('displays the stored grade, including "Ungraded" when none was stored', () => {
    renderTable();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Ungraded')).toBeInTheDocument();
  });

  /**
   * DoD item 7. `results.v1` has no score-write endpoint and
   * `results.automaticMarking` is SYSTEM-only for every staff role, so the
   * roster must be entirely read-only: no number inputs, no text boxes, no
   * comboboxes sitting in a marks cell.
   */
  it('exposes no editable score field', () => {
    renderTable();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('41 / 50')).toBeInTheDocument();
  });

  it('shows a filter-aware empty state', () => {
    renderTable({ rows: [], hasFilters: true });
    expect(screen.getByText(/no results match these filters/i)).toBeInTheDocument();

    renderTable({ rows: [], hasFilters: false });
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument();
  });

  it('shows a loading state instead of an empty state while pending', () => {
    renderTable({ rows: [], isLoading: true });
    expect(screen.queryByText(/no results yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});
