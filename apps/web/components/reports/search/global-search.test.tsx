import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalSearch } from './global-search';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: {
    GET: vi.fn().mockResolvedValue({ data: {}, response: new Response(null, { status: 200 }) }),
  },
  toApiError: () => new Error('Search error'),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strictly does not render for STUDENT role (DoD #6)', () => {
    const { container } = renderWithClient(<GlobalSearch role="STUDENT" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('global-search-trigger')).not.toBeInTheDocument();
  });

  it('renders trigger button for staff roles', () => {
    renderWithClient(<GlobalSearch role="TEACHER" />);
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument();
    expect(screen.getByText(/Search\.\.\./i)).toBeInTheDocument();
  });

  it('opens SearchDialog when clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalSearch role="SCHOOL_ADMIN" />);

    const trigger = screen.getByTestId('global-search-trigger');
    await user.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Global search input/i)).toBeInTheDocument();
  });

  it('opens SearchDialog on Ctrl+K shortcut', () => {
    renderWithClient(<GlobalSearch role="MODERATOR" />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
