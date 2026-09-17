import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCreateResultAdjustment } from '@/lib/results/staff-mutations';
import { AdjustmentDialog } from './adjustment-dialog';

vi.mock('@/lib/results/staff-mutations', () => ({
  useCreateResultAdjustment: vi.fn(),
}));

const mockUseCreateResultAdjustment = vi.mocked(useCreateResultAdjustment);
const mutateAsync = vi.fn();

const OVERRIDE_MODE = {
  kind: 'override',
  resultId: 'result-1',
  studentName: 'Ada Bello',
  totalMarks: 50,
} as const;

describe('AdjustmentDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: 'op-1' });
    mockUseCreateResultAdjustment.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('requires a reason before an adjustment can be applied', () => {
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={{ kind: 'question', examQuestionId: 'eq-1', displaySequence: 3 }}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Question was out of syllabus' },
    });
    expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeEnabled();
  });

  it('warns that a question adjustment affects every student, not just this result', () => {
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={{ kind: 'question', examQuestionId: 'eq-1', displaySequence: 3 }}
        onCreated={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/applies to every student\u2019s result for this exam/i),
    ).toBeInTheDocument();
  });

  it('sends the question target and reports the new operation id', async () => {
    const onCreated = vi.fn();
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={{ kind: 'question', examQuestionId: 'eq-1', displaySequence: 3 }}
        onCreated={onCreated}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Question was out of syllabus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        examId: 'exam-1',
        type: 'VOID_QUESTION',
        reason: 'Question was out of syllabus',
        targetExamQuestionId: 'eq-1',
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('op-1'));
  });

  it('sends a manual override against the single result, with its marks', async () => {
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={OVERRIDE_MODE}
        onCreated={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '44' } });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Remarked after appeal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /apply adjustment/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        examId: 'exam-1',
        type: 'MANUAL_OVERRIDE',
        reason: 'Remarked after appeal',
        targetResultId: 'result-1',
        overrideEarnedMarks: 44,
      }),
    );
  });

  /**
   * `max` on a number input does not stop a typed or pasted value, and the
   * DTO only enforces a non-negative integer — so without this check an
   * override above the exam total would be stored as a percentage over 100.
   */
  it('refuses an override above the exam total and says why', () => {
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={OVERRIDE_MODE}
        onCreated={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Remarked after appeal' },
    });
    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '80' } });

    expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('out of 50 marks');

    fireEvent.change(screen.getByLabelText('Marks awarded'), { target: { value: '50' } });
    expect(screen.getByRole('button', { name: /apply adjustment/i })).toBeEnabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('does not offer an adjustment type choice in override mode', () => {
    render(
      <AdjustmentDialog
        open
        onOpenChange={vi.fn()}
        examId="exam-1"
        mode={OVERRIDE_MODE}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Adjustment')).not.toBeInTheDocument();
  });
});
