import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SchoolAssessmentSettingsPage from './page';

/** Deferred by design (confirmed with the project owner) — this test just
 * proves it's an honest placeholder, not silently missing. */
describe('SchoolAssessmentSettingsPage', () => {
  it('shows an honest "not yet available" placeholder naming B11', () => {
    render(<SchoolAssessmentSettingsPage />);
    expect(screen.getByText('Assessment Rules')).toBeInTheDocument();
    expect(screen.getByText(/B11/)).toBeInTheDocument();
  });
});
