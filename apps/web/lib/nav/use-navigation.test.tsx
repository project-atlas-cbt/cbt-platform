import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNavigation } from './use-navigation';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);

function okResponse<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function Probe({ role }: { role: 'TEACHER' | 'STUDENT' }) {
  const { items, isLoading } = useNavigation(role);
  if (isLoading || !items) return <div data-testid="state">loading</div>;
  return <div data-testid="state">{items.map((i) => i.id).join(',')}</div>;
}

function renderWithClient(role: 'TEACHER' | 'STUDENT') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe role={role} />
    </QueryClientProvider>,
  );
}

describe('useNavigation', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('always includes the workspace-home item even with an otherwise-empty permission set', async () => {
    mockGet.mockReturnValueOnce(okResponse({ roles: ['TEACHER'], permissions: [] }));
    renderWithClient('TEACHER');
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('dashboard'));
  });

  it('includes an item once the user holds a granted permission under its prefix, excludes others', async () => {
    mockGet.mockReturnValueOnce(
      okResponse({
        roles: ['TEACHER'],
        permissions: [
          {
            resource: 'identity.me.read',
            section: 'Identity & Sessions',
            label: 'x',
            action: 'READ',
          },
          {
            resource: 'questionBank.view',
            section: 'Question Bank',
            label: 'x',
            action: 'READ',
            scope: 'ASSIGNED',
          },
        ],
      }),
    );
    renderWithClient('TEACHER');
    await waitFor(() => {
      const ids = screen.getByTestId('state').textContent?.split(',') ?? [];
      expect(ids).toContain('dashboard');
      expect(ids).toContain('question-bank');
      expect(ids).not.toContain('exams');
      expect(ids).not.toContain('results');
    });
  });

  it('excludes an item whose only grant is break-glass (ADR-0012: not routine navigation)', async () => {
    mockGet.mockReturnValueOnce(
      okResponse({
        roles: ['TEACHER'],
        permissions: [
          {
            resource: 'exam.viewAll',
            section: 'Exam Management',
            label: 'x',
            action: 'READ',
            breakGlass: true,
          },
        ],
      }),
    );
    renderWithClient('TEACHER');
    await waitFor(() => {
      const ids = screen.getByTestId('state').textContent?.split(',') ?? [];
      expect(ids).not.toContain('exams');
    });
  });

  it('Student sees Assessment unconditionally, plus Results/Profile only when granted', async () => {
    mockGet.mockReturnValueOnce(
      okResponse({
        roles: ['STUDENT'],
        permissions: [
          {
            resource: 'account.changeOwnProfile',
            section: 'Identity & Sessions',
            label: 'x',
            action: 'UPDATE',
            scope: 'SELF',
          },
        ],
      }),
    );
    renderWithClient('STUDENT');
    await waitFor(() => {
      const ids = screen.getByTestId('state').textContent?.split(',') ?? [];
      expect(ids).toEqual(['assessment', 'profile']);
    });
  });
});
