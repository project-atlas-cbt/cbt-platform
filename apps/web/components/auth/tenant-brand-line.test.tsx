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

  it("shows the school's name once resolved, with no logo when none is set", () => {
    mockUseTenant.mockReturnValue({
      status: 'resolved',
      school: {
        name: 'Greenfield Academy',
        subdomain: 'greenfield',
        timezone: 'Africa/Lagos',
        logoUrl: null,
        primaryColor: null,
      },
    });
    render(<TenantBrandLine />);
    expect(screen.getByText('Greenfield Academy')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the real logo image when the school has set one (B4)', () => {
    mockUseTenant.mockReturnValue({
      status: 'resolved',
      school: {
        name: 'Greenfield Academy',
        subdomain: 'greenfield',
        timezone: 'Africa/Lagos',
        logoUrl:
          'https://minio.example/atlas-media-dev/schools/x/branding/y/logo.png?signature=abc',
        primaryColor: '#2563EB',
      },
    });
    render(<TenantBrandLine />);
    const img = screen.getByRole('img', { name: 'Greenfield Academy logo' });
    expect(img).toHaveAttribute(
      'src',
      'https://minio.example/atlas-media-dev/schools/x/branding/y/logo.png?signature=abc',
    );
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
