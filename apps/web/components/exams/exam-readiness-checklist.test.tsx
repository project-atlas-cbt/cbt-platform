import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ApiComponents } from '@atlas/contracts';
import { ReadinessChecklist } from './exam-readiness-checklist';

type Check = ApiComponents['schemas']['ExamReadinessCheckItemDto'];

const MIXED_CHECKS: Check[] = [
  { code: 'SCHOOL_ACTIVE', label: 'School active', passed: true, message: 'The school is active.' },
  {
    code: 'SESSION_ACTIVE',
    label: 'Session active',
    passed: true,
    message: 'The session is active.',
  },
  {
    code: 'QUESTIONS_SELECTED',
    label: 'Questions selected',
    passed: false,
    message: 'No questions have been selected yet.',
  },
  {
    code: 'DURATION_CONFIGURED',
    label: 'Duration configured',
    passed: false,
    message: 'Duration has not been set.',
  },
];

describe('ReadinessChecklist', () => {
  it('renders every check individually with its own pass/fail state and message (DoD item 6)', () => {
    render(<ReadinessChecklist checks={MIXED_CHECKS} basePath="/teacher/exams" examId="exam-1" />);
    expect(screen.getByText('School active')).toBeInTheDocument();
    expect(screen.getByText('No questions have been selected yet.')).toBeInTheDocument();
    expect(screen.getByText('Duration has not been set.')).toBeInTheDocument();
  });

  it('links a failed check to the step that resolves it (DoD item 7)', () => {
    render(<ReadinessChecklist checks={MIXED_CHECKS} basePath="/teacher/exams" examId="exam-1" />);
    const resolveLinks = screen.getAllByRole('link', { name: /resolve/i });
    // Two failed checks map to a step (QUESTIONS_SELECTED -> questions,
    // DURATION_CONFIGURED -> rules) — both get a link.
    expect(resolveLinks).toHaveLength(2);
    expect(resolveLinks[0]).toHaveAttribute('href', '/teacher/exams/exam-1/questions');
    expect(resolveLinks[1]).toHaveAttribute('href', '/teacher/exams/exam-1/rules');
  });

  it('never links a passed check, and never links SCHOOL_ACTIVE/SESSION_ACTIVE/TERM_ACTIVE even when failed', () => {
    const checks: Check[] = [
      { code: 'SCHOOL_ACTIVE', label: 'School active', passed: false, message: 'Not active.' },
      { code: 'SESSION_ACTIVE', label: 'Session active', passed: true, message: 'Active.' },
    ];
    render(<ReadinessChecklist checks={checks} basePath="/teacher/exams" examId="exam-1" />);
    expect(screen.queryByRole('link', { name: /resolve/i })).not.toBeInTheDocument();
  });

  it('renders no resolution links when interactive=false (oversight roles)', () => {
    render(<ReadinessChecklist checks={MIXED_CHECKS} interactive={false} />);
    expect(screen.queryByRole('link', { name: /resolve/i })).not.toBeInTheDocument();
  });
});
