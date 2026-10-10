import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolAssessmentSettingsPage from './page';
import { useAssessmentRules } from '@/lib/school-settings/queries';
import { useUpdateAssessmentRules } from '@/lib/school-settings/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/school-settings/queries', () => ({ useAssessmentRules: vi.fn() }));
vi.mock('@/lib/school-settings/mutations', () => ({ useUpdateAssessmentRules: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/forms/settings-dirty-context', () => ({ useRegisterFormDirty: vi.fn() }));

const mockUseAssessmentRules = vi.mocked(useAssessmentRules);
const mockUseUpdateAssessmentRules = vi.mocked(useUpdateAssessmentRules);
const mockUseHasPermission = vi.mocked(useHasPermission);

const FRESH = {
  defaultExamDurationSeconds: null,
  defaultAttemptLimit: 1,
  defaultNavigationPolicy: 'FREE',
  defaultRandomizeQuestions: false,
  defaultRandomizeOptions: false,
};

function loaded(data: object) {
  mockUseAssessmentRules.mockReturnValue({ isPending: false, isError: false, data } as never);
}

describe('SchoolAssessmentSettingsPage', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mockUseUpdateAssessmentRules.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while loading', () => {
    mockUseAssessmentRules.mockReturnValue({ isPending: true, isError: false } as never);
    render(<SchoolAssessmentSettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseAssessmentRules.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<SchoolAssessmentSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the saved defaults, with duration in minutes', () => {
    loaded({
      ...FRESH,
      defaultExamDurationSeconds: 2700,
      defaultAttemptLimit: 2,
      defaultNavigationPolicy: 'SEQUENTIAL_NO_REVISIT',
    });
    render(<SchoolAssessmentSettingsPage />);
    expect(screen.getByLabelText('Duration (minutes)')).toHaveValue(45);
    expect(screen.getByLabelText('Number of attempts')).toHaveValue(2);
    expect(
      screen.getAllByText('Sequential — one question at a time, no going back').length,
    ).toBeGreaterThan(0);
  });

  it('saves minutes as seconds and the randomization choices', async () => {
    loaded(FRESH);
    mutateAsync.mockResolvedValueOnce({
      ...FRESH,
      defaultExamDurationSeconds: 3600,
      defaultRandomizeQuestions: true,
    });
    render(<SchoolAssessmentSettingsPage />);

    await userEvent.type(screen.getByLabelText('Duration (minutes)'), '60');
    await userEvent.click(screen.getByRole('checkbox', { name: /question order/i }));
    await userEvent.click(screen.getByRole('button', { name: /save assessment rules/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      defaultExamDurationSeconds: 3600,
      defaultAttemptLimit: 1,
      defaultNavigationPolicy: 'FREE',
      defaultRandomizeQuestions: true,
      defaultRandomizeOptions: false,
    });
    expect(await screen.findByText('Assessment rules saved.')).toBeInTheDocument();
  });

  it('a blank duration clears the default', async () => {
    loaded({ ...FRESH, defaultExamDurationSeconds: 1800 });
    mutateAsync.mockResolvedValueOnce(FRESH);
    render(<SchoolAssessmentSettingsPage />);

    await userEvent.clear(screen.getByLabelText('Duration (minutes)'));
    await userEvent.click(screen.getByRole('button', { name: /save assessment rules/i }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ defaultExamDurationSeconds: null }),
    );
  });

  it('refuses zero attempts without calling the API', async () => {
    loaded(FRESH);
    render(<SchoolAssessmentSettingsPage />);

    await userEvent.clear(screen.getByLabelText('Number of attempts'));
    await userEvent.type(screen.getByLabelText('Number of attempts'), '0');
    await userEvent.click(screen.getByRole('button', { name: /save assessment rules/i }));

    expect(await screen.findByText('Allow at least one attempt.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('is view-only without the manage permission', () => {
    mockUseHasPermission.mockReturnValue(false);
    loaded(FRESH);
    render(<SchoolAssessmentSettingsPage />);
    expect(screen.getByLabelText('Duration (minutes)')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /save assessment rules/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access to assessment rules/)).toBeInTheDocument();
  });
});
