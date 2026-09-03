import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevisionHistory, type RevisionHistoryItem } from './revision-history';

const REVISIONS: RevisionHistoryItem[] = [
  {
    id: 'rev1',
    revisionNumber: 1,
    status: 'REJECTED',
    content: '<p>Original question</p>',
    difficulty: 'EASY',
    marks: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdByMembershipId: 'mem1',
    options: [{ id: 'o1', content: 'A', correctFlag: true }],
  },
  {
    id: 'rev2',
    revisionNumber: 2,
    status: 'DRAFT',
    content: '<p>Revised question</p>',
    difficulty: 'MEDIUM',
    marks: 3,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    createdByMembershipId: 'mem1',
    options: [{ id: 'o2', content: 'A', correctFlag: true }],
  },
];

describe('RevisionHistory', () => {
  it('lists every revision, newest first, with its real status', () => {
    render(<RevisionHistory currentRevisionId="rev2" revisions={REVISIONS} />);
    const items = screen.getAllByText(/^Revision \d$/);
    expect(items[0]).toHaveTextContent('Revision 2');
    expect(items[1]).toHaveTextContent('Revision 1');
  });

  it('marks the current revision', () => {
    render(<RevisionHistory currentRevisionId="rev2" revisions={REVISIONS} />);
    expect(screen.getByText('(Current)')).toBeInTheDocument();
  });

  it('expanding a REJECTED revision shows an honest placeholder, never a fabricated reason', async () => {
    render(<RevisionHistory currentRevisionId="rev2" revisions={REVISIONS} />);
    await userEvent.click(screen.getByRole('button', { name: /revision 1/i }));
    expect(screen.getByText(/reviewer feedback isn.t available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/original question/i)).toBeInTheDocument();
  });

  it('expanding a DRAFT revision shows no feedback placeholder', async () => {
    render(<RevisionHistory currentRevisionId="rev2" revisions={REVISIONS} />);
    await userEvent.click(screen.getByRole('button', { name: /revision 2/i }));
    expect(screen.queryByText(/reviewer feedback isn.t available yet/i)).not.toBeInTheDocument();
  });

  it('F10: a matching reviewHistory entry replaces the placeholder with the real decision', async () => {
    render(
      <RevisionHistory
        currentRevisionId="rev2"
        revisions={REVISIONS}
        reviewHistory={[
          {
            revisionNumber: 1,
            decision: 'REJECTED',
            comment: 'Option B is ambiguous.',
            reviewerName: 'Mrs Bello',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /revision 1/i }));
    expect(screen.getByText(/option b is ambiguous/i)).toBeInTheDocument();
    expect(screen.getByText(/mrs bello/i)).toBeInTheDocument();
    expect(screen.queryByText(/reviewer feedback isn.t available yet/i)).not.toBeInTheDocument();
  });

  it('F10: a revision with no matching reviewHistory entry still falls back to the honest placeholder', async () => {
    render(<RevisionHistory currentRevisionId="rev2" revisions={REVISIONS} reviewHistory={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /revision 1/i }));
    expect(screen.getByText(/reviewer feedback isn.t available yet/i)).toBeInTheDocument();
  });
});
