import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExamWizardShell } from './exam-wizard-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/teacher/exams/e1/edit' }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ me: { membership: { id: 'm-me' } } }) }));
vi.mock('@/components/help/help-link', () => ({ HelpLink: () => null }));

const exam = (createdByMembershipId: string) =>
  ({
    id: 'e1',
    status: 'DRAFT',
    createdByMembershipId,
    createdByName: 'Ade Ola',
  }) as never;

describe('ExamWizardShell (ADR-0037)', () => {
  it("shows the builder to the exam's author", () => {
    render(
      <ExamWizardShell basePath="/teacher/exams" examId="e1" exam={exam('m-me')}>
        <p>builder form</p>
      </ExamWizardShell>,
    );
    expect(screen.getByText('builder form')).toBeInTheDocument();
  });

  it('shows anyone else who owns it and a link to Exam Control, never the edit form', () => {
    render(
      <ExamWizardShell basePath="/teacher/exams" examId="e1" exam={exam('m-other')}>
        <p>builder form</p>
      </ExamWizardShell>,
    );
    expect(screen.queryByText('builder form')).not.toBeInTheDocument();
    expect(screen.getByText('Ade Ola')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open it in exam control/i })).toHaveAttribute(
      'href',
      '/teacher/exam-control/e1',
    );
  });
});
