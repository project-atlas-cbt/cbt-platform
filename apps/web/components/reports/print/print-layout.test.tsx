import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrintLayout } from './print-layout';

const back = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/tenant', () => ({
  useTenant: () => ({
    school: { name: 'Apex Model College', logoUrl: null },
  }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    me: {
      user: { displayName: 'Principal Smith' },
      membership: { loginIdentifier: 'ADM01' },
    },
  }),
}));

describe('PrintLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('renders official document header, title, and children', () => {
    render(
      <PrintLayout title="Official Term Results" subtitle="2026/2027 Session">
        <div data-testid="report-content">Table Content Here</div>
      </PrintLayout>,
    );

    expect(screen.getAllByText('Official Term Results').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2026/2027 Session').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Apex Model College')).toBeInTheDocument();
    expect(screen.getByTestId('report-content')).toBeInTheDocument();
    expect(screen.getByText(/Principal \/ Exam Officer Stamp/i)).toBeInTheDocument();
  });

  it('triggers window.print() on Print button click', async () => {
    const user = userEvent.setup();
    render(
      <PrintLayout title="Exam Report">
        <div>Content</div>
      </PrintLayout>,
    );

    const printBtn = screen.getByTestId('print-button');
    await user.click(printBtn);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('navigates back when Back button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <PrintLayout title="Exam Report">
        <div>Content</div>
      </PrintLayout>,
    );

    const backBtn = screen.getByRole('button', { name: /Return to previous screen/i });
    await user.click(backBtn);

    expect(back).toHaveBeenCalledTimes(1);
  });
});
