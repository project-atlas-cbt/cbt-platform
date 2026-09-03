import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewHistoryTimeline } from './review-history-timeline';

describe('ReviewHistoryTimeline', () => {
  it('shows an honest empty state when no decisions exist yet', () => {
    render(<ReviewHistoryTimeline history={[]} />);
    expect(screen.getByText(/no prior review decisions/i)).toBeInTheDocument();
  });

  it("renders each decision oldest-first order as given, with the reviewer's name and comment", () => {
    render(
      <ReviewHistoryTimeline
        history={[
          {
            id: 'r1',
            revisionNumber: 1,
            decision: 'REJECTED',
            comment: 'Option B is ambiguous.',
            reviewerName: 'Mrs Bello',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'r2',
            revisionNumber: 2,
            decision: 'APPROVED',
            comment: null,
            reviewerName: 'Mrs Bello',
            createdAt: '2026-01-05T00:00:00Z',
          },
        ]}
      />,
    );
    const revisionLabels = screen.getAllByText(/^Revision \d$/);
    expect(revisionLabels[0]).toHaveTextContent('Revision 1');
    expect(revisionLabels[1]).toHaveTextContent('Revision 2');
    expect(screen.getByText('Option B is ambiguous.')).toBeInTheDocument();
    expect(screen.getByText(/no note left/i)).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
