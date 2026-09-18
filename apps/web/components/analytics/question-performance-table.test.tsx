import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionPerformanceTable } from './question-performance-table';

describe('QuestionPerformanceTable', () => {
  const questions = [
    {
      examQuestionId: 'eq-1',
      sequence: 1,
      questionId: 'q-1',
      questionType: 'MULTIPLE_CHOICE',
      subjectId: 'sub-math',
      topicName: 'Algebra & Quadratics',
      exposureCount: 50,
      correctCount: 45,
      incorrectCount: 5,
      unansweredCount: 0,
      correctRate: 0.9,
      incorrectRate: 0.1,
      unansweredRate: 0,
      voidedForScoring: false,
    },
    {
      examQuestionId: 'eq-2',
      sequence: 2,
      questionId: 'q-2',
      questionType: 'MULTIPLE_CHOICE',
      subjectId: 'sub-math',
      topicName: 'Trigonometry & Radians',
      exposureCount: 50,
      correctCount: 15,
      incorrectCount: 30,
      unansweredCount: 5,
      correctRate: 0.3,
      incorrectRate: 0.6,
      unansweredRate: 0.1,
      voidedForScoring: false,
    },
    {
      examQuestionId: 'eq-3',
      sequence: 3,
      questionId: 'q-3',
      questionType: 'MULTIPLE_CHOICE',
      subjectId: 'sub-math',
      topicName: 'Calculus Limits',
      exposureCount: 50,
      correctCount: 20,
      incorrectCount: 20,
      unansweredCount: 10,
      correctRate: 0.4,
      incorrectRate: 0.4,
      unansweredRate: 0.2,
      voidedForScoring: true,
    },
  ];

  it('renders question rows, difficulty indicators, and summaries', () => {
    render(<QuestionPerformanceTable questions={questions} examTitle="Mathematics Mock Exam" />);

    expect(screen.getByText(/mathematics mock exam — question performance/i)).toBeInTheDocument();
    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.getByText('Algebra & Quadratics')).toBeInTheDocument();
    expect(screen.getByText('Q2')).toBeInTheDocument();
    expect(screen.getByText('Trigonometry & Radians')).toBeInTheDocument();
    expect(screen.getByText('Difficult')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
  });

  it('filters to difficult items (< 40% correct) when button is toggled', () => {
    render(<QuestionPerformanceTable questions={questions} />);

    const filterButton = screen.getByRole('button', { name: /difficult \(< 40%\)/i });
    fireEvent.click(filterButton);

    // Q1 (90% correct) should be filtered out
    expect(screen.queryByText('Algebra & Quadratics')).not.toBeInTheDocument();
    // Q2 (30% correct) should still be visible
    expect(screen.getByText('Trigonometry & Radians')).toBeInTheDocument();
  });

  it('filters questions by topic search input', () => {
    render(<QuestionPerformanceTable questions={questions} />);

    const searchInput = screen.getByPlaceholderText(/search by topic, question #, or type/i);
    fireEvent.change(searchInput, { target: { value: 'Trigonometry' } });

    expect(screen.queryByText('Algebra & Quadratics')).not.toBeInTheDocument();
    expect(screen.getByText('Trigonometry & Radians')).toBeInTheDocument();
  });

  it('opens question drilldown dialog with response breakdown and reteaching recommendation', () => {
    render(<QuestionPerformanceTable questions={questions} />);

    const q2Row = screen.getByText('Trigonometry & Radians').closest('tr');
    expect(q2Row).not.toBeNull();
    fireEvent.click(q2Row!);

    expect(screen.getByText('Question 2 Performance')).toBeInTheDocument();
    expect(screen.getByText(/high failure rate/i)).toBeInTheDocument();
    expect(screen.getByText(/30 students/i)).toBeInTheDocument(); // 30 incorrect
    expect(screen.getByText(/15 students/i)).toBeInTheDocument(); // 15 correct
  });
});
