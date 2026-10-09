import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSplash } from './loading-splash';
import { useOptionalTenant } from '@/lib/tenant';

vi.mock('@/lib/tenant', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenant')>('@/lib/tenant');
  return { ...actual, useOptionalTenant: vi.fn() };
});
const mockTenant = vi.mocked(useOptionalTenant);

const longName = 'Federal Government Girls College Senior Secondary School, Ikot Ekpene';

function school(name: string, logoUrl: string | null = null) {
  return { name, subdomain: 'ola', timezone: 'Africa/Lagos', logoUrl, primaryColor: '#7a1f2b' };
}

describe('LoadingSplash', () => {
  it("shows the school's initials, name and the grey Powered by credit", () => {
    mockTenant.mockReturnValue({ status: 'resolved', school: school('Our Lady of Apostles') });
    render(<LoadingSplash />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByText('OLA')).toBeInTheDocument();
    expect(screen.getByText('Our Lady of Apostles')).toBeInTheDocument();
    expect(screen.getByText(/powered by/i)).toBeInTheDocument();
  });

  it("uses the school's logo when it has one", () => {
    mockTenant.mockReturnValue({
      status: 'resolved',
      school: school('Our Lady of Apostles', 'https://media.example/logo.png'),
    });
    render(<LoadingSplash />);
    expect(screen.getByRole('img', { name: 'Our Lady of Apostles logo' })).toBeInTheDocument();
  });

  it('keeps a long school name on one capped line, full name in the tooltip', () => {
    mockTenant.mockReturnValue({ status: 'resolved', school: school(longName) });
    render(<LoadingSplash />);
    const name = screen.getByText(longName);
    expect(name).toHaveClass('truncate');
    expect(name).toHaveAttribute('title', longName);
    expect(name.closest('[role="status"]')).toHaveClass('max-w-80');
  });

  it('shows placeholders, not the product, while the school is still loading', () => {
    mockTenant.mockReturnValue({ status: 'loading', school: null });
    render(<LoadingSplash />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform')).toBeNull();
  });

  it('shows the product mark on the platform host, where there is no school', () => {
    mockTenant.mockReturnValue(null);
    render(<LoadingSplash />);
    expect(
      screen.getByText(process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/powered by/i)).not.toBeInTheDocument();
  });
});
