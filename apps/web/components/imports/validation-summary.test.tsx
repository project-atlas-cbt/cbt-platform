import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ValidationSummary } from './validation-summary';

describe('ValidationSummary', () => {
  it('renders the total, valid, and needs-attention counts (DoD item 3)', () => {
    render(<ValidationSummary job={{ totalRows: 1500, validRows: 1487, invalidRows: 13 }} />);
    expect(screen.getByText('Total rows').nextElementSibling).toHaveTextContent('1,500');
    expect(screen.getByText('Valid').nextElementSibling).toHaveTextContent('1,487');
    expect(screen.getByText('Needs attention').nextElementSibling).toHaveTextContent('13');
  });

  it('states unambiguously how many rows will be imported vs. skipped (DoD item 6)', () => {
    render(<ValidationSummary job={{ totalRows: 100, validRows: 90, invalidRows: 10 }} />);
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      '90 rows will be imported. 10 rows will be skipped until corrected and re-uploaded.',
    );
  });

  it('states every row will be imported when nothing needs attention', () => {
    render(<ValidationSummary job={{ totalRows: 5, validRows: 5, invalidRows: 0 }} />);
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      'All 5 rows passed validation and will be imported.',
    );
  });

  it('uses singular wording for exactly one row', () => {
    render(<ValidationSummary job={{ totalRows: 1, validRows: 1, invalidRows: 0 }} />);
    expect(screen.getByTestId('import-summary-sentence')).toHaveTextContent(
      'All 1 row passed validation and will be imported.',
    );
  });
});
