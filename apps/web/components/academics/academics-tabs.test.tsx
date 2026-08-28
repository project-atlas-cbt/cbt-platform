import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AcademicsTabs } from './academics-tabs';

let pathname = '/school/academics/sessions';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

describe('AcademicsTabs', () => {
  beforeEach(() => {
    pathname = '/school/academics/sessions';
  });

  it('marks the active tab and links to every section under the given base path', () => {
    render(<AcademicsTabs basePath="/school/academics" />);
    const sessionsTab = screen.getByRole('link', { name: 'Sessions' });
    expect(sessionsTab).toHaveAttribute('aria-current', 'page');
    expect(sessionsTab).toHaveAttribute('href', '/school/academics/sessions');
    expect(screen.getByRole('link', { name: 'Terms' })).not.toHaveAttribute('aria-current');
    for (const label of ['Sessions', 'Terms', 'Departments', 'Classes', 'Subjects']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('respects a different base path — e.g. the HOD or Moderator role root', () => {
    pathname = '/hod/academics/classes';
    render(<AcademicsTabs basePath="/hod/academics" />);
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute(
      'href',
      '/hod/academics/classes',
    );
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks a class/department detail sub-route as still within the Classes/Departments tab', () => {
    pathname = '/school/academics/classes/abc-123';
    render(<AcademicsTabs basePath="/school/academics" />);
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('aria-current', 'page');
  });
});
