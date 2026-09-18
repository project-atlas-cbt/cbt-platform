import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertPanel, type OperationalAlert } from './alert-panel';

describe('AlertPanel', () => {
  const alerts: OperationalAlert[] = [
    {
      id: 'no-session',
      severity: 'critical',
      title: 'No Active Academic Session',
      description: 'You must configure and activate a current session before scheduling exams.',
      actionLabel: 'Configure Academic Session',
      actionHref: '/school/sessions',
    },
    {
      id: 'pending-imports',
      severity: 'warning',
      title: 'Pending Bulk Imports',
      description: '2 import jobs are awaiting validation or commit.',
      actionLabel: 'Review Imports',
      actionHref: '/school/imports',
    },
  ];

  it('renders operational alerts with title, description, and action link', () => {
    render(<AlertPanel alerts={alerts} />);

    expect(screen.getByText('Operational Alerts')).toBeInTheDocument();
    expect(screen.getByText('No Active Academic Session')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You must configure and activate a current session before scheduling exams.',
      ),
    ).toBeInTheDocument();

    const sessionLink = screen.getByRole('link', { name: /configure academic session/i });
    expect(sessionLink).toHaveAttribute('href', '/school/sessions');

    const importsLink = screen.getByRole('link', { name: /review imports/i });
    expect(importsLink).toHaveAttribute('href', '/school/imports');
  });

  it('renders all clear state when alerts array is empty', () => {
    render(<AlertPanel alerts={[]} />);

    expect(screen.getByText('Operational Alerts')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No operational alerts. Everything is currently configured and operational.',
      ),
    ).toBeInTheDocument();
  });
});
