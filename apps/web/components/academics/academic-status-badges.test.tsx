import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SessionStatusBadge,
  TermStatusBadge,
  DepartmentStatusBadge,
  ClassStatusBadge,
  SubjectStatusBadge,
} from './academic-status-badges';

describe('academic status badges', () => {
  it('renders every AcademicSession status with a real label', () => {
    for (const value of ['DRAFT', 'UPCOMING', 'CURRENT', 'CLOSED', 'ARCHIVED'] as const) {
      const { unmount } = render(<SessionStatusBadge value={value} />);
      expect(screen.getByText(new RegExp(value, 'i'))).toBeInTheDocument();
      unmount();
    }
  });

  it('renders every AcademicTerm status with a real label', () => {
    for (const value of ['DRAFT', 'UPCOMING', 'CURRENT', 'CLOSED', 'ARCHIVED'] as const) {
      const { unmount } = render(<TermStatusBadge value={value} />);
      expect(screen.getByText(new RegExp(value, 'i'))).toBeInTheDocument();
      unmount();
    }
  });

  it('renders every Department status', () => {
    for (const value of ['ACTIVE', 'INACTIVE'] as const) {
      const { unmount } = render(<DepartmentStatusBadge value={value} />);
      expect(screen.getByText(new RegExp(value, 'i'))).toBeInTheDocument();
      unmount();
    }
  });

  it('renders every ClassGroup status, including ARCHIVED', () => {
    for (const value of ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const) {
      const { unmount } = render(<ClassStatusBadge value={value} />);
      expect(screen.getByText(new RegExp(value, 'i'))).toBeInTheDocument();
      unmount();
    }
  });

  it('renders every Subject status', () => {
    for (const value of ['ACTIVE', 'INACTIVE'] as const) {
      const { unmount } = render(<SubjectStatusBadge value={value} />);
      expect(screen.getByText(new RegExp(value, 'i'))).toBeInTheDocument();
      unmount();
    }
  });
});
