import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useHasPermission } from '@/lib/nav';
import { useAdjustmentOperation, useStaffResult } from '@/lib/results/staff-queries';
import {
  useCreateResultAdjustment,
  useReleaseResult,
  useWithholdResult,
} from '@/lib/results/staff-mutations';
import { StaffResultDetailScreen } from './staff-result-detail-screen';

vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/results/staff-queries', () => ({
  useStaffResult: vi.fn(),
  useAdjustmentOperation: vi.fn(),
}));
vi.mock('@/lib/results/staff-mutations', () => ({
  useWithholdResult: vi.fn(),
  useReleaseResult: vi.fn(),
  useCreateResultAdjustment: vi.fn(),
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseStaffResult = vi.mocked(useStaffResult);
const mockUseAdjustmentOperation = vi.mocked(useAdjustmentOperation);
const mockUseWithholdResult = vi.mocked(useWithholdResult);
const mockUseReleaseResult = vi.mocked(useReleaseResult);
const mockUseCreateResultAdjustment = vi.mocked(useCreateResultAdjustment);

const RESULT = {
  id: 'result-1',
  attemptId: 'attempt-1',
  studentProfileId: 'sp-1',
  studentName: 'Ada Bello',
  studentIdentifier: 'STU/2026/001',
  classId: 'c1',
  className: 'SS2A',
  state: 'FINALIZED',
  totalMarks: 50,
  earnedMarks: 41,
  percentage: 82,
  correctCount: 41,
  incorrectCount: 7,
  unansweredCount: 2,
  partialCount: 0,
  grade: 'A',
  withheld: false,
  withheldReason: null,
  voidedReason: null,
  finalizedAt: '2026-09-01T10:00:00Z',
  submittedAt: '2026-09-01T09:40:00Z',
  attemptState: 'SUBMITTED',
  examId: 'exam-1',
  examTitle: 'First Term Examination',
  subjectName: 'Mathematics',
  gradingScaleVersionId: 'gsv-7',
  questions: [
    {
      examQuestionId: 'eq-1',
      displaySequence: 1,
      content: '<p>What is 2 + 2?</p>',
      correctness: 'CORRECT',
      awardedMarks: 2,
      maximumMarks: 2,
      voided: false,
    },
  ],
  adjustments: [],
};

/** Grants by role, taken from `permission-table.ts`'s Results section. */
const GRANTS: Record<string, string[]> = {
  teacher: ['results.viewIndividualResult', 'results.withhold'],
  hod: ['results.viewIndividualResult', 'results.withhold', 'results.adjust'],
  moderator: ['results.viewIndividualResult', 'results.withhold', 'results.adjust'],
  schoolAdmin: [
    'results.viewIndividualResult',
    'results.withhold',
    'results.adjust',
    'results.manualOverride',
  ],
};

function actAs(role: keyof typeof GRANTS) {
  mockUseHasPermission.mockImplementation((resource: string) =>
    GRANTS[role].includes(resource),
  );
}

function renderScreen() {
  return render(
    <StaffResultDetailScreen resultId="result-1" backPath="/moderator/results/exam-1" />,
  );
}

describe('StaffResultDetailScreen', () => {
  beforeEach(() => {
    mockUseAdjustmentOperation.mockReturnValue({ isPending: true } as never);
    mockUseWithholdResult.mockReturnValue({ mutateAsync: vi.fn() } as never);
    mockUseReleaseResult.mockReturnValue({ mutateAsync: vi.fn() } as never);
    mockUseCreateResultAdjustment.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    mockUseStaffResult.mockReturnValue({
      data: RESULT,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('shows a loading state', () => {
    mockUseStaffResult.mockReturnValue({ data: undefined, isPending: true } as never);
    actAs('moderator');
    renderScreen();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows a retryable error state', () => {
    mockUseStaffResult.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    actAs('moderator');
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('displays the stored grade and the scale version it was frozen against (ADR-0018)', () => {
    actAs('moderator');
    renderScreen();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText(/grading scale version gsv-7/i)).toBeInTheDocument();
    expect(screen.getByText(/never recalculated on display/i)).toBeInTheDocument();
  });

  it('offers withhold but no adjustment entry point to a teacher', () => {
    actAs('teacher');
    renderScreen();
    expect(screen.getByRole('button', { name: /withhold from student/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjust/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /override marks/i })).not.toBeInTheDocument();
  });

  it('offers question adjustments but not manual override to a moderator or HOD', () => {
    actAs('moderator');
    renderScreen();
    expect(screen.getByRole('button', { name: /adjust/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /override marks/i })).not.toBeInTheDocument();
  });

  it('offers manual override only to a school admin', () => {
    actAs('schoolAdmin');
    renderScreen();
    expect(screen.getByRole('button', { name: /override marks/i })).toBeInTheDocument();
  });

  it('shows the release action instead of withhold once a result is withheld', () => {
    mockUseStaffResult.mockReturnValue({
      data: { ...RESULT, withheld: true, withheldReason: 'Pending script review' },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    actAs('teacher');
    renderScreen();
    expect(screen.getByRole('button', { name: /release to student/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /withhold from student/i })).not.toBeInTheDocument();
    expect(screen.getByText(/pending script review/i)).toBeInTheDocument();
  });

  it('shows a voided result to staff with its reason rather than hiding it (ADR-0025)', () => {
    mockUseStaffResult.mockReturnValue({
      data: {
        ...RESULT,
        state: 'VOIDED',
        voidedReason: 'Attempt invalidated after malpractice review',
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    actAs('moderator');
    renderScreen();
    expect(screen.getByText(/attempt invalidated after malpractice review/i)).toBeInTheDocument();
  });

  /** DoD item 7 — marks are never directly editable; the only path to a
   * score change is an audited adjustment raised through a dialog. */
  it('exposes no editable score field on the result itself', () => {
    actAs('schoolAdmin');
    renderScreen();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('41 / 50 marks')).toBeInTheDocument();
  });
});
