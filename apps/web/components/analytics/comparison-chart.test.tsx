import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComparisonChart } from './comparison-chart';

describe('ComparisonChart', () => {
  const items = [
    {
      id: 'cls-1',
      name: 'SS2 Science A',
      averagePercentage: 78.5,
      highestPercentage: 96,
      lowestPercentage: 45,
      passRate: 92,
      resultCount: 35,
    },
    {
      id: 'cls-2',
      name: 'SS2 Commercial B',
      averagePercentage: 54.2,
      highestPercentage: 82,
      lowestPercentage: 30,
      passRate: 65,
      resultCount: 30,
    },
  ];

  it('renders comparative horizontal bars with labels and percentages', () => {
    render(
      <ComparisonChart
        items={items}
        title="Class Performance Comparison"
        subtitle="Comparing average scores across SS2 arms"
      />,
    );

    expect(screen.getByText('Class Performance Comparison')).toBeInTheDocument();
    expect(screen.getByText('SS2 Science A')).toBeInTheDocument();
    expect(screen.getByText('SS2 Commercial B')).toBeInTheDocument();
    expect(screen.getByText('78.5%')).toBeInTheDocument();
    expect(screen.getByText('54.2%')).toBeInTheDocument();
  });

  it('toggles between chart view and accessible table view', () => {
    render(<ComparisonChart items={items} title="Class Performance Comparison" />);

    const toggleButton = screen.getByRole('button', { name: /switch to accessible table view/i });
    fireEvent.click(toggleButton);

    const table = screen.getByRole('table', { name: 'Class Performance Comparison' });
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Highest')).toBeInTheDocument();
    expect(screen.getByText('Lowest')).toBeInTheDocument();
    expect(screen.getByText('Pass Rate')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
  });

  it('renders empty message when no comparison items are provided', () => {
    render(
      <ComparisonChart
        items={[]}
        title="Empty Comparison"
        emptyMessage="No classes assigned yet."
      />,
    );

    expect(screen.getByText('No classes assigned yet.')).toBeInTheDocument();
  });
});
