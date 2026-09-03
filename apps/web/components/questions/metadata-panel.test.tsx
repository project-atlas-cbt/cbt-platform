import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { MetadataPanel } from './metadata-panel';
import { useAssignedSubjects } from '@/lib/questions/queries';
import type { QuestionFormValues } from '@/lib/questions/validation';

// `useAssignedSubjects` (not `useSubjects`/`useDepartments` from
// `lib/academics/queries` — both 403 for TEACHER; see MetadataPanel's own
// doc comment for the gap-closure this replaced).
vi.mock('@/lib/questions/queries', () => ({
  useAssignedSubjects: vi.fn(),
  useTopics: vi.fn(() => ({ data: { topics: [] } })),
}));
vi.mock('@/lib/questions/mutations', () => ({
  useCreateTopic: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

const mockUseAssignedSubjects = vi.mocked(useAssignedSubjects);

const SUBJECTS = [
  { id: 'sub1', name: 'Mathematics', code: 'MTH', departmentId: 'dep1', status: 'ACTIVE' },
];

function Harness({
  subjectId = 'sub1',
  outOfScopeError,
}: {
  subjectId?: string;
  outOfScopeError?: string;
}) {
  const form = useForm<QuestionFormValues>({
    defaultValues: {
      subjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: '',
      difficulty: 'EASY',
      marks: 2,
      explanation: '',
      options: [
        { content: 'A', correctFlag: true },
        { content: 'B', correctFlag: false },
      ],
    },
  });
  return (
    <Form {...form}>
      <MetadataPanel form={form} {...(outOfScopeError ? { outOfScopeError } : {})} />
    </Form>
  );
}

describe('MetadataPanel', () => {
  beforeEach(() => {
    mockUseAssignedSubjects.mockReturnValue({ data: { subjects: SUBJECTS } } as never);
  });

  it('derives the department read-only label from the selected subject', () => {
    render(<Harness />);
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Assigned to a department')).toBeInTheDocument();
  });

  it('shows "No department" when the subject has none', () => {
    mockUseAssignedSubjects.mockReturnValue({
      data: { subjects: [{ ...SUBJECTS[0]!, departmentId: null }] },
    } as never);
    render(<Harness />);
    expect(screen.getByText('No department')).toBeInTheDocument();
  });

  it('renders the server out-of-scope error inline', () => {
    render(
      <Harness outOfScopeError="You have no active assignment covering this subject and level." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/no active assignment/i);
  });

  it('renders the class level picker', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Class level')).toBeInTheDocument();
  });
});
