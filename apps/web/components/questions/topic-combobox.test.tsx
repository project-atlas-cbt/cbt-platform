import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopicCombobox } from './topic-combobox';
import { useTopics } from '@/lib/questions/queries';
import { useCreateTopic } from '@/lib/questions/mutations';

vi.mock('@/lib/questions/queries', () => ({ useTopics: vi.fn() }));
vi.mock('@/lib/questions/mutations', () => ({ useCreateTopic: vi.fn() }));

const mockUseTopics = vi.mocked(useTopics);
const mockUseCreateTopic = vi.mocked(useCreateTopic);

const TOPICS = [
  { id: 't1', subjectId: 'sub1', parentTopicId: null, name: 'Quadratic Equations' },
  { id: 't2', subjectId: 'sub1', parentTopicId: null, name: 'Linear Equations' },
];

describe('TopicCombobox', () => {
  const createMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    mockUseTopics.mockReturnValue({ data: { topics: TOPICS } } as never);
    mockUseCreateTopic.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
  });

  it('is disabled with a helper placeholder until a subject is selected', () => {
    render(
      <TopicCombobox label="Topic" subjectId={undefined} value={undefined} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Topic')).toBeDisabled();
  });

  it('filters existing topics as the user types', async () => {
    render(<TopicCombobox label="Topic" subjectId="sub1" value={undefined} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Topic');
    await userEvent.type(input, 'Quad');
    expect(screen.getByText('Quadratic Equations')).toBeInTheDocument();
    expect(screen.queryByText('Linear Equations')).not.toBeInTheDocument();
  });

  it('selecting an existing topic calls onChange with its real id', async () => {
    const onChange = vi.fn();
    render(<TopicCombobox label="Topic" subjectId="sub1" value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Topic'));
    await userEvent.click(screen.getByText('Linear Equations'));
    // `handleSelect` forwards the real `TopicResponseDto` row (it also
    // carries `subjectId`/`parentTopicId`) — the component's own contract
    // only promises `id`/`name` are present, not that nothing else is.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't2', name: 'Linear Equations' }),
    );
  });

  it('auto-resolves an exact-match name typed then left unclicked, on blur', async () => {
    const onChange = vi.fn();
    render(
      <>
        <TopicCombobox label="Topic" subjectId="sub1" value={undefined} onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.type(screen.getByLabelText('Topic'), 'Linear Equations');
    expect(onChange).not.toHaveBeenCalled();
    // Tab/click away without ever clicking the dropdown option.
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't2', name: 'Linear Equations' }),
    );
  });

  it('reverts unresolved free text on blur instead of leaving it silently unlinked', async () => {
    const onChange = vi.fn();
    render(
      <>
        <TopicCombobox label="Topic" subjectId="sub1" value={undefined} onChange={onChange} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.type(screen.getByLabelText('Topic'), 'Something not real');
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Topic')).toHaveValue('');
  });

  it('offers to create an unrecognised name and resolves it to a real id', async () => {
    const onChange = vi.fn();
    createMutateAsync.mockResolvedValueOnce({
      id: 't3',
      subjectId: 'sub1',
      parentTopicId: null,
      name: 'Trigonometry',
    });
    render(<TopicCombobox label="Topic" subjectId="sub1" value={undefined} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'Trigonometry');
    // Role-based, not `getByText`: the button's label is split across
    // three sibling text nodes (`Create "`, the value, `"`) by the curly-
    // quote JSX interpolation, so a `getByText` regex against a single
    // node's own text never matches — the accessible name (what
    // `getByRole` compares against) correctly concatenates all of them.
    await userEvent.click(screen.getByRole('button', { name: /create.*trigonometry/i }));
    expect(createMutateAsync).toHaveBeenCalledWith({ subjectId: 'sub1', name: 'Trigonometry' });
    expect(onChange).toHaveBeenCalledWith({ id: 't3', name: 'Trigonometry' });
  });
});
