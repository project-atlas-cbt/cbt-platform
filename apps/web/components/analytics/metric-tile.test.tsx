import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { MetricTile } from './metric-tile';

describe('MetricTile', () => {
  it('renders label, value, and subtitle', () => {
    render(
      <MetricTile
        label="Total Students"
        value="1,240"
        subtitle="Enrolled active students"
        icon={<Users data-testid="user-icon" />}
      />,
    );

    expect(screen.getByText('Total Students')).toBeInTheDocument();
    expect(screen.getByText('1,240')).toBeInTheDocument();
    expect(screen.getByText('Enrolled active students')).toBeInTheDocument();
    expect(screen.getByTestId('user-icon')).toBeInTheDocument();
  });

  it('renders skeleton in loading state', () => {
    render(<MetricTile label="Average Score" value="74.2%" isLoading={true} />);

    expect(screen.getByText('Average Score')).toBeInTheDocument();
    expect(screen.queryByText('74.2%')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders emphasis styles when emphasis prop is set', () => {
    const { container } = render(<MetricTile label="Active Sessions" value="5" emphasis />);

    expect(container.firstChild).toHaveClass('border-brand-primary/40');
  });
});
