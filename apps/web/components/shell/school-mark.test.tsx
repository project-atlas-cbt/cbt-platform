import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initials, SchoolMark } from './school-mark';

describe('SchoolMark', () => {
  it('shows the uploaded logo when there is one', () => {
    render(<SchoolMark name="Oakridge College" logoUrl="https://media.example/logo.png" />);
    expect(screen.getByRole('img', { name: 'Oakridge College logo' })).toBeInTheDocument();
  });

  it('falls back to the school initials, skipping small joining words', () => {
    expect(initials('Our Lady of Apostles')).toBe('OLA');
    expect(initials('Oakridge College')).toBe('OC');
    expect(initials('St. Mary’s Model School, Ibadan')).toBe('SMM');
    expect(initials('')).toBe('?');
  });
});
