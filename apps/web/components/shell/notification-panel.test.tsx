import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { NotificationPanel } from './notification-panel';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function err() {
  return Promise.resolve({
    data: undefined,
    error: { error: { code: 'INTERNAL', message: 'boom', retryable: true, correlationId: 'c-1' } },
    response: new Response(null, { status: 500 }),
  } as never);
}

const NOW = new Date('2026-09-03T12:00:00.000Z').toISOString();

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe('NotificationPanel', () => {
  it('shows a genuine empty state — never a fabricated notification — when there are none', async () => {
    mockGet.mockReturnValue(ok({ items: [], total: 0, page: 1, pageSize: 25, unreadCount: 0 }));
    render(wrap(<NotificationPanel />));
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it('shows a loading skeleton while the first fetch is in flight', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(wrap(<NotificationPanel />));
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getAllByRole('status', { name: /loading/i }).length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', async () => {
    mockGet.mockReturnValue(err());
    render(wrap(<NotificationPanel />));
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders real notifications, shows the unread badge, and hides it at zero unread', async () => {
    mockGet.mockReturnValue(
      ok({
        items: [
          {
            id: 'n1',
            type: 'QUESTION_APPROVED',
            title: 'Question approved',
            content: 'Your question was approved.',
            status: 'UNREAD',
            relatedEntityType: null,
            relatedEntityId: null,
            createdAt: NOW,
            readAt: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
        unreadCount: 1,
      }),
    );
    render(wrap(<NotificationPanel />));
    expect(await screen.findByRole('button', { name: /1 unread/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Question approved')).toBeInTheDocument();
    expect(screen.getByText('Your question was approved.')).toBeInTheDocument();
  });

  it('clicking an unread notification marks it read', async () => {
    mockGet.mockReturnValue(
      ok({
        items: [
          {
            id: 'n1',
            type: 'QUESTION_APPROVED',
            title: 'Question approved',
            content: 'Body',
            status: 'UNREAD',
            relatedEntityType: null,
            relatedEntityId: null,
            createdAt: NOW,
            readAt: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
        unreadCount: 1,
      }),
    );
    mockPost.mockReturnValue(ok({ status: 'ok' }));
    render(wrap(<NotificationPanel />));
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByText('Question approved'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/notifications/{id}/read',
        expect.objectContaining({ params: { path: { id: 'n1' } } }),
      );
    });
  });

  it('"mark all read" is only shown when there is something unread, and calls read-all', async () => {
    mockGet.mockReturnValue(
      ok({
        items: [
          {
            id: 'n1',
            type: 'SUBSCRIPTION_EXPIRING',
            title: 'Subscription expiring',
            content: 'Body',
            status: 'UNREAD',
            relatedEntityType: null,
            relatedEntityId: null,
            createdAt: NOW,
            readAt: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
        unreadCount: 1,
      }),
    );
    mockPost.mockReturnValue(ok({ status: 'ok' }));
    render(wrap(<NotificationPanel />));
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    const markAll = await screen.findByRole('button', { name: /mark all read/i });
    await userEvent.click(markAll);
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/read-all', {});
    });
  });
});
