import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandingPreview } from './branding-preview';

/** `03 §5`'s six preview contexts — illustrative mockups, not live app
 * screens (Exam interface/Result pages don't exist as built screens yet). */
describe('BrandingPreview', () => {
  it('renders all six named contexts', () => {
    render(<BrandingPreview primaryColor={undefined} />);
    for (const label of [
      'Login',
      'Dashboard',
      'Exam interface',
      'Buttons',
      'Tables',
      'Result pages',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('falls back to the platform default without throwing on a malformed colour', () => {
    expect(() => render(<BrandingPreview primaryColor="not-a-colour" />)).not.toThrow();
  });

  it('scopes its derived tokens to a local class, not :root', () => {
    const { container } = render(<BrandingPreview primaryColor="#1D4ED8" />);
    const style = container.querySelector('style');
    expect(style?.innerHTML).not.toContain(':root');
  });
});
