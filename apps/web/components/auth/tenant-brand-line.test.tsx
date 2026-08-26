import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantBrandLine } from './tenant-brand-line';
import { useTenant } from '@/lib/tenant';

vi.mock('@/lib/tenant', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenant')>('@/lib/tenant');
  return { ...actual, useTenant: vi.fn() };
});
const mockUseTenant = vi.mocked(useTenant);

describe('TenantBrandLine', () => {
  it('shows a skeleton while loading', () => {
    mockUseTenant.mockReturnValue({ status: 'loading', school: null });
    const { container } = render(<TenantBrandLine />);
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it("shows the school's name once resolved", () => {
    mockUseTenant.mockReturnValue({
      status: 'resolved',
      school: { name: 'Greenfield Academy', subdomain: 'greenfield', timezone: 'Africa/Lagos' },
    });
    render(<TenantBrandLine />);
    expect(screen.getByText('Greenfield Academy')).toBeInTheDocument();
  });

  it('renders nothing when no school resolved (platform host)', () => {
    mockUseTenant.mockReturnValue({ status: 'resolved', school: null });
    const { container } = render(<TenantBrandLine />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when resolution failed — degrades this section only', () => {
    mockUseTenant.mockReturnValue({ status: 'error', school: null });
    const { container } = render(<TenantBrandLine />);
    expect(container).toBeEmptyDOMElement();
  });
});
