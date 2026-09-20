import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchDialog } from './search-dialog';
import { apiClient } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    GET: vi.fn(),
  },
  toApiError: () => new Error('Search failed'),
}));

const mockGet = vi.mocked(apiClient.GET);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('SearchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input and prompt for minimum characters', () => {
    renderWithClient(<SearchDialog open={true} onOpenChange={vi.fn()} role="SCHOOL_ADMIN" />);

    expect(screen.getByLabelText(/Global search input/i)).toBeInTheDocument();
    expect(screen.getByText(/Type at least 2 characters to search/i)).toBeInTheDocument();
  });

  it('queries backend and renders grouped results by corpus', async () => {
    mockGet.mockResolvedValue({
      data: {
        students: [{ id: 's1', label: 'John Doe', detail: 'AD-001' }],
        teachers: [],
        hods: [],
        classes: [],
        exams: [{ id: 'e1', label: 'Mathematics Midterm', detail: 'Math' }],
        questions: [],
        results: [],
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<SearchDialog open={true} onOpenChange={vi.fn()} role="SCHOOL_ADMIN" />);

    const input = screen.getByLabelText(/Global search input/i);
    fireEvent.change(input, { target: { value: 'Mat' } });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/search', {
        params: { query: { q: 'Mat' } },
      });
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Mathematics Midterm')).toBeInTheDocument();
      expect(screen.getByText('Students')).toBeInTheDocument();
      expect(screen.getByText('Exams')).toBeInTheDocument();
    });
  });

  it('shows empty state when no results are found', async () => {
    mockGet.mockResolvedValue({
      data: {
        students: [],
        teachers: [],
        hods: [],
        classes: [],
        exams: [],
        questions: [],
        results: [],
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<SearchDialog open={true} onOpenChange={vi.fn()} role="SCHOOL_ADMIN" />);

    const input = screen.getByLabelText(/Global search input/i);
    fireEvent.change(input, { target: { value: 'Nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/No results found for “Nonexistent”/i)).toBeInTheDocument();
    });
  });

  it('navigates with Enter key to the highlighted result item', async () => {
    mockGet.mockResolvedValue({
      data: {
        students: [{ id: 's-99', label: 'Ada Lovelace', detail: 'AD-099' }],
        teachers: [],
        hods: [],
        classes: [],
        exams: [],
        questions: [],
        results: [],
      },
      response: new Response(null, { status: 200 }),
    });

    renderWithClient(<SearchDialog open={true} onOpenChange={vi.fn()} role="SCHOOL_ADMIN" />);

    const input = screen.getByLabelText(/Global search input/i);
    fireEvent.change(input, { target: { value: 'Ada' } });

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/school/people/students/s-99');
  });
});
