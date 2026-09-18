import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PerformanceChart } from './performance-chart';

describe('PerformanceChart', () => {
  const distribution = [
    { lowerBound: 0, upperBound: 19, count: 2, percentage: 5 },
    { lowerBound: 20, upperBound: 39, count: 6, percentage: 15 },
    { lowerBound: 40, upperBound: 59, count: 12, percentage: 30 },
    { lowerBound: 60, upperBound: 79, count: 14, percentage: 35 },
    { lowerBound: 80, upperBound: 100, count: 6, percentage: 15 },
  ];

  it('renders score distribution bars and bucket percentages', () => {
    render(<PerformanceChart distribution={distribution} title="Exam Score Distribution" />);

    expect(screen.getByText('Exam Score Distribution')).toBeInTheDocument();
    expect(screen.getByText('0–19%')).toBeInTheDocument();
    expect(screen.getByText('80–100%')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument(); // 60-79% bucket count
  });

  it('toggles between chart visualization and accessible table view', () => {
    render(<PerformanceChart distribution={distribution} title="Exam Score Distribution" />);

    const toggleButton = screen.getByRole('button', { name: /switch to accessible table view/i });
    expect(toggleButton).toBeInTheDocument();

    // Switch to table
    fireEvent.click(toggleButton);

    const table = screen.getByRole('table', { name: 'Exam Score Distribution' });
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Score Range')).toBeInTheDocument();
    expect(screen.getByText('Student Count')).toBeInTheDocument();

    // Switch back to chart
    fireEvent.click(screen.getByRole('button', { name: /switch to chart visualization/i }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders calm empty state when distribution has 0 students', () => {
    render(<PerformanceChart distribution={[]} title="Empty Exam" />);

    expect(screen.getByText('No score distribution data available yet.')).toBeInTheDocument();
  });
});
