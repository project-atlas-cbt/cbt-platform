import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_GRADING_SCALE_TEMPLATE } from '@atlas/domain';
import { GradingScaleSection } from './grading-scale-section';
import { useGradingScales, useGradingScaleVersions } from '@/lib/school-settings/queries';
import { usePutGradingScale } from '@/lib/school-settings/mutations';
import { ApiError } from '@/lib/api';

vi.mock('@/lib/school-settings/queries', () => ({
  useGradingScales: vi.fn(),
  useGradingScaleVersions: vi.fn(),
}));
vi.mock('@/lib/school-settings/mutations', () => ({ usePutGradingScale: vi.fn() }));

const mockScales = vi.mocked(useGradingScales);
const mockVersions = vi.mocked(useGradingScaleVersions);
const mockPut = vi.mocked(usePutGradingScale);

const TEMPLATE = DEFAULT_GRADING_SCALE_TEMPLATE.map((b) => ({ ...b }));
const PASS_FAIL = [
  { label: 'Pass', minPercentage: 40, maxPercentage: 100, isPassing: true },
  { label: 'Fail', minPercentage: 0, maxPercentage: 39.99, isPassing: false },
];

function version(id: string, versionNumber: number, bands = PASS_FAIL, inUse = false) {
  return { id, versionNumber, createdAt: '2026-10-01T09:00:00.000Z', bands, inUse };
}

function scale(id: string, level: string | null, current = version(`${id}-v1`, 1)) {
  return { id, name: 'School scale', level, currentVersion: current, updatedAt: '' };
}

function withScales(items: ReturnType<typeof scale>[]) {
  mockScales.mockReturnValue({
    isPending: false,
    isError: false,
    data: { items, defaultTemplate: TEMPLATE },
  } as never);
}

const fromInput = (grade: string) =>
  screen.getByRole('textbox', { name: `From percentage, grade ${grade}` });
const toInput = (grade: string) =>
  screen.getByRole('textbox', { name: `To percentage, grade ${grade}` });

async function replace(input: HTMLElement, value: string) {
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

describe('GradingScaleSection', () => {
  const mutateAsync = vi.fn();
  const onDirtyChange = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    onDirtyChange.mockReset();
    mockPut.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockVersions.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        items: [version('s1-v2', 2, PASS_FAIL), version('s1-v1', 1, TEMPLATE, true)],
      },
    } as never);
  });

  it('shows an error state when the scales cannot load', () => {
    mockScales.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('offers the default template, unsaved, when the school has no scale', async () => {
    withScales([]);
    mutateAsync.mockResolvedValueOnce(scale('s1', null, version('s1-v1', 1, TEMPLATE)));
    render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);

    expect(
      screen.getByText('No school-wide grading scale has been saved yet.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(7); // header + A–F
    expect(fromInput('A')).toHaveValue('90');

    await userEvent.click(screen.getByRole('button', { name: 'Save grading scale' }));

    expect(mutateAsync).toHaveBeenCalledWith({ name: 'Default grading scale', bands: TEMPLATE });
    expect(await screen.findByText('Grading scale saved as version 1.')).toBeInTheDocument();
  });

  it('shows gap, overlap and duplicate-label problems and does not save', async () => {
    withScales([]);
    render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);

    await replace(fromInput('B'), '85');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No band covers percentages between 79.99 and 85.',
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await replace(toInput('C'), '86');
    expect(screen.getByRole('alert')).toHaveTextContent('Bands "C" and "B" overlap.');

    await replace(screen.getByRole('textbox', { name: 'Grade label, row 2' }), 'A');
    expect(screen.getByRole('alert')).toHaveTextContent('Band label "A" is used more than once.');

    await userEvent.click(screen.getByRole('button', { name: 'Save grading scale' }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('adds a version to the existing scale and shows its history', async () => {
    withScales([scale('s1', null, version('s1-v2', 2, PASS_FAIL))]);
    mutateAsync.mockResolvedValueOnce(scale('s1', null, version('s1-v3', 3)));
    const { rerender } = render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);

    expect(screen.getByText(/Version 2, saved/)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save as version 3' });
    expect(save).toBeDisabled();

    await replace(fromInput('Pass'), '50');
    await replace(toInput('Fail'), '49.99');
    await userEvent.click(save);

    expect(mutateAsync).toHaveBeenCalledWith({
      scaleId: 's1',
      name: 'School scale',
      bands: [
        { label: 'Pass', minPercentage: 50, maxPercentage: 100, isPassing: true },
        { label: 'Fail', minPercentage: 0, maxPercentage: 49.99, isPassing: false },
      ],
    });
    // The list refetches after the save (invalidation) and the editor
    // reloads on the new version.
    withScales([scale('s1', null, version('s1-v3', 3))]);
    rerender(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);
    expect(await screen.findByText('Grading scale saved as version 3.')).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    const history = screen.getByText('Version history').closest('details')!;
    const rows = within(history).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2 (current)'); // from the mocked history
    expect(rows[1]).toHaveTextContent('Not used yet');
    expect(rows[2]).toHaveTextContent('Used for grades');
  });

  it('shows the server error when a save is rejected', async () => {
    withScales([]);
    mutateAsync.mockRejectedValueOnce(
      new ApiError({
        code: 'VALIDATION_ERROR',
        message: 'Grading scale bands are invalid.',
        retryable: false,
        correlationId: 'c1',
      }),
    );
    render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save grading scale' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Grading scale bands are invalid.');
  });

  it('is read-only without the manage permission', () => {
    withScales([scale('s1', null)]);
    render(<GradingScaleSection canEdit={false} onDirtyChange={onDirtyChange} />);

    expect(fromInput('Pass')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add grade/i })).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access to the grading scale/i)).toBeInTheDocument();
  });

  it('gives a class level its own scale, starting from the school-wide bands', async () => {
    withScales([scale('s1', null)]);
    mutateAsync.mockResolvedValueOnce(scale('s2', 'JSS1'));
    render(<GradingScaleSection canEdit onDirtyChange={onDirtyChange} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Scale for' }));
    await userEvent.click(
      within(await screen.findByRole('listbox')).getByText('JSS1 (uses school-wide)'),
    );

    expect(screen.getByText('JSS1 uses the school-wide scale (version 1).')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Give JSS1 its own scale' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save grading scale' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'JSS1 grading scale',
      level: 'JSS1',
      bands: PASS_FAIL,
    });
  });
});
