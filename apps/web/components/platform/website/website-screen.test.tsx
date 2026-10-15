import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebsiteScreen } from './website-screen';
import {
  useDeleteMarketingLead,
  useMarketingLeads,
  useMarketingSummary,
} from '@/lib/platform/marketing';

vi.mock('@/lib/platform/marketing', () => ({
  useMarketingSummary: vi.fn(),
  useMarketingLeads: vi.fn(),
  useDeleteMarketingLead: vi.fn(),
}));

const summary = {
  days: 7,
  visits: 40,
  visitors: 120,
  leads: 2,
  mobilePercent: 75,
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(9 + i).padStart(2, '0')}`,
    visits: i * 2,
    visitors: i,
  })),
  topPages: [{ label: '/pricing', count: 9 }],
  topSources: [{ label: 'LinkedIn', count: 5 }],
};

const lead = {
  id: 'l1',
  createdAt: '2026-10-15T09:00:00.000Z',
  kind: 'DEMO_REQUEST',
  name: 'Bola Ade',
  phone: '0803 000 0000',
  email: 'bola@example.com',
  school: 'Example College',
  role: 'Exam officer',
  state: 'Oyo',
  students: '300 to 700',
  interest: 'A demo',
  message: null,
  pagesViewed: ['/', '/pricing'],
  source: 'LinkedIn',
};

const mutate = vi.fn();

beforeEach(() => {
  vi.mocked(useMarketingSummary).mockReturnValue({
    data: summary,
    isError: false,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useMarketingLeads).mockReturnValue({
    data: { leads: [lead], total: 1, page: 1, pageSize: 25 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  mutate.mockReset();
  vi.mocked(useDeleteMarketingLead).mockReturnValue({ mutate, isPending: false } as never);
});

describe('WebsiteScreen', () => {
  it('shows visit counts, top pages and sources for the chosen period', async () => {
    render(<WebsiteScreen />);
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('/pricing')).toBeInTheDocument();
    expect(screen.getAllByText('LinkedIn').length).toBeGreaterThan(0);
    expect(useMarketingSummary).toHaveBeenLastCalledWith(30);
    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(useMarketingSummary).toHaveBeenLastCalledWith(7);
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists a contact with ways to reach them and the pages they viewed', () => {
    render(<WebsiteScreen />);
    const row = screen.getByText('Bola Ade').closest('tr')!;
    expect(within(row).getByText('Demo request')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/2348030000000',
    );
    expect(within(row).getByRole('link', { name: 'bola@example.com' })).toHaveAttribute(
      'href',
      'mailto:bola@example.com',
    );
    expect(within(row).getByText('Home, /pricing')).toBeInTheDocument();
  });

  it('asks before deleting a contact', async () => {
    render(<WebsiteScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete contact from Bola Ade' }));
    expect(screen.getByRole('dialog', { name: 'Delete this contact?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete contact' }));
    expect(mutate).toHaveBeenCalledWith('l1', expect.anything());
  });

  it('says plainly when no one has got in touch', () => {
    vi.mocked(useMarketingLeads).mockReturnValue({
      data: { leads: [], total: 0, page: 1, pageSize: 25 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<WebsiteScreen />);
    expect(screen.getByText('No one has got in touch yet')).toBeInTheDocument();
  });
});
