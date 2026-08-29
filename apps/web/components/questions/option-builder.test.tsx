import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { OptionBuilder } from './option-builder';
import type { QuestionFormValues } from '@/lib/questions/validation';

function Harness({
  initialOptions,
  error,
}: {
  initialOptions: QuestionFormValues['options'];
  error?: string;
}) {
  const form = useForm<QuestionFormValues>({
    defaultValues: {
      subjectId: '',
      level: '',
      questionType: 'SINGLE_CHOICE',
      content: '',
      difficulty: '',
      marks: '',
      explanation: '',
      options: initialOptions,
    },
  });
  return <OptionBuilder control={form.control} {...(error ? { error } : {})} />;
}

describe('OptionBuilder', () => {
  it('renders every option as a text input with a correct-answer radio', () => {
    render(
      <Harness
        initialOptions={[
          { content: 'A', correctFlag: true },
          { content: 'B', correctFlag: false },
        ]}
      />,
    );
    expect(screen.getByLabelText('Option 1 text')).toHaveValue('A');
    expect(screen.getByLabelText('Option 2 text')).toHaveValue('B');
    expect(screen.getByRole('radio', { name: /mark option 1 as correct/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /mark option 2 as correct/i })).not.toBeChecked();
  });

  it('disables removing an option below the 2-option minimum', () => {
    render(
      <Harness
        initialOptions={[
          { content: 'A', correctFlag: true },
          { content: 'B', correctFlag: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /remove option 1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove option 2/i })).toBeDisabled();
  });

  it('allows adding up to the 4-option maximum, then disables Add option', async () => {
    render(
      <Harness
        initialOptions={[
          { content: 'A', correctFlag: true },
          { content: 'B', correctFlag: false },
          { content: 'C', correctFlag: false },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /add option/i }));
    expect(screen.getByLabelText('Option 4 text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add option/i })).toBeDisabled();
  });

  it('selecting a different correct answer is exclusive (never two at once)', async () => {
    render(
      <Harness
        initialOptions={[
          { content: 'A', correctFlag: true },
          { content: 'B', correctFlag: false },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /mark option 2 as correct/i }));
    expect(screen.getByRole('radio', { name: /mark option 1 as correct/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /mark option 2 as correct/i })).toBeChecked();
  });

  it('renders a validation error message when given one', () => {
    render(
      <Harness
        initialOptions={[
          { content: 'A', correctFlag: false },
          { content: 'B', correctFlag: false },
        ]}
        error="Exactly one option must be marked correct."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /exactly one option must be marked correct/i,
    );
  });
});
