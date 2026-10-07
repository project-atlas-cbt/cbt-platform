import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useSetExamConfiguration } from '@/lib/exams/mutations';
import { RulesForm } from './exam-rules-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exams/queries', () => ({ useExam: vi.fn() }));
vi.mock('@/lib/exams/mutations', () => ({ useSetExamConfiguration: vi.fn() }));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExam = vi.mocked(useExam);
const mockUseSetExamConfiguration = vi.mocked(useSetExamConfiguration);

function examData(resultSettingsLocked: boolean, durationSeconds = 3600) {
  return {
    id: 'exam-1',
    status: 'DRAFT',
    durationSeconds,
    attemptLimit: 1,
    navigationPolicy: 'FREE',
    randomizeQuestions: false,
    randomizeOptions: false,
    resultPolicy: 'SCHOOL_ADMIN',
    resultDetailVisibility: 'SCORE_ONLY',
    resultSettingsLocked,
    accessMode: 'OPEN_TO_ELIGIBLE',
    generalInstructions: null,
    navigationInstructions: null,
    submissionInstructions: null,
    accommodations: null,
  };
}

let mutateAsync: ReturnType<typeof vi.fn>;

function setup({
  locked,
  isAdmin,
  durationSeconds,
}: {
  locked: boolean;
  isAdmin: boolean;
  durationSeconds?: number;
}) {
  mockUseExam.mockReturnValue({
    data: examData(locked, durationSeconds),
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useExam>);
  mockUseHasPermission.mockReturnValue(isAdmin);
  render(<RulesForm examId="exam-1" basePath="/teacher/exams" />);
}

describe('RulesForm result settings lock (ADR-0010, 2026-10-06 amendment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockUseSetExamConfiguration.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useSetExamConfiguration>);
  });

  it('fixes both result settings for a teacher when the school has locked them', async () => {
    setup({ locked: true, isAdmin: false });

    expect(screen.getByRole('combobox', { name: 'Result publication' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'What students see' })).toBeDisabled();
    expect(screen.getByText(/your school has locked these two settings/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    const payload = mutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('resultPolicy');
    expect(payload).not.toHaveProperty('resultDetailVisibility');
    expect(payload).toHaveProperty('durationSeconds', 3600);
  });

  it('leaves both settings editable for a School Admin under the lock', async () => {
    setup({ locked: true, isAdmin: true });

    expect(screen.getByRole('combobox', { name: 'Result publication' })).toBeEnabled();
    expect(screen.queryByText(/your school has locked/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      resultPolicy: 'SCHOOL_ADMIN',
      resultDetailVisibility: 'SCORE_ONLY',
    });
  });

  it('leaves both settings editable for a teacher when the school has not locked them', () => {
    setup({ locked: false, isAdmin: false });

    expect(screen.getByRole('combobox', { name: 'Result publication' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'What students see' })).toBeEnabled();
    expect(screen.queryByText(/your school has locked/i)).not.toBeInTheDocument();
  });

  it('bug audit P2-4: a blank duration is left out of the save instead of sent as 0', async () => {
    setup({ locked: false, isAdmin: false, durationSeconds: 0 });

    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    const payload = mutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('durationSeconds');
    expect(payload).toHaveProperty('attemptLimit', 1);
  });
});
