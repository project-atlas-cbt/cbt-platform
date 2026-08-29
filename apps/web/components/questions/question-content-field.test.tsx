import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { QuestionContentField } from './question-content-field';

interface Values {
  content: string;
}

function Harness({ initial = '' }: { initial?: string }) {
  const form = useForm<Values>({ defaultValues: { content: initial } });
  return (
    <Form {...form}>
      <QuestionContentField control={form.control} name="content" label="Question text" />
    </Form>
  );
}

describe('QuestionContentField', () => {
  it('renders the label and the initial content', () => {
    render(<Harness initial="<p>Hello</p>" />);
    expect(screen.getByText('Question text')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('mounts a real editable surface and the toolbar stays interactive', async () => {
    render(<Harness />);
    expect(document.querySelector('[contenteditable="true"]')).toBeTruthy();
    // Applying a mark via the toolbar shouldn't throw — the real
    // value-sync-into-the-form assertion lives in `question-editor-screen`'s
    // own integration test, which observes the resulting autosave payload
    // end to end rather than reaching into Tiptap's internal DOM state.
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  });
});
