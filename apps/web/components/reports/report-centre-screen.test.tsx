import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportCentreScreen } from './report-centre-screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
  toApiError: () => new Error('API Error'),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ReportCentreScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 6 CSV export options for School Admin', () => {
    renderWithClient(<ReportCentreScreen role="SCHOOL_ADMIN" basePath="/school" />);

    expect(screen.getByText('Reporting & Export Centre')).toBeInTheDocument();
    expect(screen.getByText('Exam Results & Marks')).toBeInTheDocument();
    expect(screen.getByText('Exam Participation & Attendance')).toBeInTheDocument();
    expect(screen.getByText('Student Directory')).toBeInTheDocument();
    expect(screen.getByText('Class Groups & Levels')).toBeInTheDocument();
    expect(screen.getByText('Question Bank')).toBeInTheDocument();
    expect(screen.getByText('Teaching Staff Directory')).toBeInTheDocument();
  });

  it('excludes Teaching Staff Directory for Teacher role', () => {
    renderWithClient(<ReportCentreScreen role="TEACHER" basePath="/teacher" />);

    expect(screen.getByText('Exam Results & Marks')).toBeInTheDocument();
    expect(screen.queryByText('Teaching Staff Directory')).not.toBeInTheDocument();
  });

  it('renders printable reports section with links', () => {
    renderWithClient(<ReportCentreScreen role="HOD" basePath="/hod" />);

    expect(screen.getByText('Printable Official Reports')).toBeInTheDocument();
    expect(screen.getByText('Examination Results Broadsheet')).toBeInTheDocument();
    expect(screen.getByText('Exam Performance & Item Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Class Academic Performance Sheet')).toBeInTheDocument();
    expect(screen.getByText('Student Academic Performance Transcript')).toBeInTheDocument();
  });

  it('opens ExportDialog when Request Export button is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportCentreScreen role="SCHOOL_ADMIN" basePath="/school" />);

    const requestButtons = screen.getAllByRole('button', { name: /Request Export/i });
    await user.click(requestButtons[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Export Data/i)).toBeInTheDocument();
  });
});
