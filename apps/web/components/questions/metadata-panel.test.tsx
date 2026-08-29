import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { MetadataPanel } from './metadata-panel';
import { useDepartments, useSubjects } from '@/lib/academics/queries';
import type { QuestionFormValues } from '@/lib/questions/validation';

vi.mock('@/lib/academics/queries', () => ({ useDepartments: vi.fn(), useSubjects: vi.fn() }));
vi.mock('@/lib/questions/queries', () => ({ useTopics: vi.fn(() => ({ data: { topics: [] } })) }));
vi.mock('@/lib/questions/mutations', () => ({
  useCreateTopic: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

const mockUseSubjects = vi.mocked(useSubjects);
const mockUseDepartments = vi.mocked(useDepartments);

const SUBJECTS = [
  { id: 'sub1', name: 'Mathematics', code: 'MTH', departmentId: 'dep1', status: 'ACTIVE' },
];
const DEPARTMENTS = [{ id: 'dep1', name: 'Sciences', code: 'SCI', status: 'ACTIVE' }];

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
    mockUseSubjects.mockReturnValue({ data: { subjects: SUBJECTS } } as never);
    mockUseDepartments.mockReturnValue({ data: { departments: DEPARTMENTS } } as never);
  });

  it('derives the department read-only label from the selected subject', () => {
    render(<Harness />);
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Sciences')).toBeInTheDocument();
  });

  it('shows "No department" when the subject has none', () => {
    mockUseSubjects.mockReturnValue({
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
