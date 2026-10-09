import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StandardSetupDialog } from './standard-setup-dialog';
import { useStandardSetupPreview } from '@/lib/academics/queries';
import { useApplyStandardSetup } from '@/lib/academics/mutations';

vi.mock('@/lib/academics/queries', () => ({ useStandardSetupPreview: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({ useApplyStandardSetup: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const preview = {
  departments: [
    { code: 'SCI', name: 'Science', status: 'EXISTS' },
    { code: 'HUM', name: 'Humanities', status: 'NEW' },
  ],
  streams: [{ code: 'SCI', name: 'Science', status: 'NEW' }],
  subjects: [
    {
      code: 'MTH',
      name: 'Mathematics',
      departmentCode: 'SCI',
      departmentName: 'Science',
      stage: 'JSS_AND_SS',
      choiceGroupName: null,
      status: 'PLACE',
    },
    {
      code: 'ENG',
      name: 'English Language',
      departmentCode: 'HUM',
      departmentName: 'Humanities',
      stage: 'JSS_AND_SS',
      choiceGroupName: null,
      status: 'NEW',
    },
    {
      code: 'CRS',
      name: 'Christian Religious Studies',
      departmentCode: 'HUM',
      departmentName: 'Humanities',
      stage: 'JSS_AND_SS',
      choiceGroupName: 'Religion: choose 1',
      status: 'NEW',
    },
  ],
};

describe('StandardSetupDialog', () => {
  const mutateAsync = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({
      departmentsCreated: 1,
      streamsCreated: 1,
      subjectsCreated: 1,
      subjectsPlaced: 1,
      choiceGroupsCreated: 0,
    });
    vi.mocked(useStandardSetupPreview).mockReturnValue({
      data: preview,
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useApplyStandardSetup).mockReturnValue({ mutateAsync, isPending: false } as never);
  });

  it('labels departments and streams apart and shows what is already there', () => {
    render(<StandardSetupDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText('Science department')).toBeDisabled();
    expect(screen.getByLabelText('Science stream')).toBeChecked();
    expect(screen.getByText('Already added')).toBeInTheDocument();
    expect(screen.getByText('Put in Science')).toBeInTheDocument();
    expect(screen.getByText(/Religion: choose 1/)).toBeInTheDocument();
  });

  it('sends only what is ticked and new', async () => {
    render(<StandardSetupDialog open onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByLabelText(/Christian Religious Studies/));
    await userEvent.click(screen.getByRole('button', { name: 'Add 4 items' }));
    expect(mutateAsync).toHaveBeenCalledWith({
      departmentCodes: ['HUM'],
      streamCodes: ['SCI'],
      subjectCodes: ['MTH', 'ENG'],
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
