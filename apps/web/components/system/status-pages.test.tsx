import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';
import UnsupportedBrowserPage from '@/app/unsupported-browser/page';

describe('F21 error pages', () => {
  it('404 names the problem and links to the start page', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: "This page doesn't exist" }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to the start page' })).toHaveAttribute('href', '/');
  });

  it('unsupported browser lists the baseline versions and the Windows 7 route', () => {
    render(<UnsupportedBrowserPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/cannot run/);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(expect.arrayContaining(['Google Chrome 111', 'Mozilla Firefox 115']));
    expect(screen.getByText('Firefox ESR')).toBeVisible();
  });
});
