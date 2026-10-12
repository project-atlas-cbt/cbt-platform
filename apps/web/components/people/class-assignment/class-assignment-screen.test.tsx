import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassAssignmentScreen } from './class-assignment-screen';
import { useAcademicsContext, useClass, useClassRoster, useClasses } from '@/lib/academics/queries';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/academics/queries', () => ({
  useClass: vi.fn(),
  useClassRoster: vi.fn(),
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, POST: vi.fn() } };
});

const mockUseClass = vi.mocked(useClass);
const mockUseClassRoster = vi.mocked(useClassRoster);
const mockUseAcademicsContext = vi.mocked(useAcademicsContext);
const mockUseClasses = vi.mocked(useClasses);
const mockPost = vi.mocked(apiClient.POST);

const ROSTER = [
  {
    enrollmentId: 'e1',
    studentProfileId: 'sp1',
    studentId: 'ST001',
    displayName: 'Ada Okoye',
    startDate: '2026-09-01',
  },
  {
    enrollmentId: 'e2',
    studentProfileId: 'sp2',
    studentId: 'ST002',
    displayName: 'Bola Ade',
    startDate: '2026-09-01',
  },
];

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClassAssignmentScreen classId="c1" />
    </QueryClientProvider>,
  );
}

describe('ClassAssignmentScreen (§24 — Moderator bulk class-move)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockUseClass.mockReturnValue({
      isPending: false,
      isError: false,
      data: { id: 'c1', name: 'SS2A' },
      refetch: vi.fn(),
    } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: ROSTER },
      refetch: vi.fn(),
    } as never);
    mockUseAcademicsContext.mockReturnValue({ data: { session: { id: 'sess1' } } } as never);
    mockUseClasses.mockReturnValue({
      data: {
        classes: [
          { id: 'c1', name: 'SS2A' },
          { id: 'c2', name: 'SS2B' },
        ],
      },
    } as never);
  });

  it('shows the roster with a select-all checkbox', () => {
    renderScreen();
    expect(screen.getByText('Ada Okoye')).toBeInTheDocument();
    expect(screen.getByText('Bola Ade')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move/i })).toBeDisabled();
  });

  it('shows the first-run empty state for a class with no roster', () => {
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
      refetch: vi.fn(),
    } as never);
    renderScreen();
    expect(screen.getByText('No students in this class yet')).toBeInTheDocument();
  });

  it('moves selected students and reports per-student partial failure, not an all-or-nothing illusion', async () => {
    // First selected student's move succeeds, second's fails — proves
    // per-student outcome reporting, not an all-or-nothing illusion.
    mockPost
      .mockResolvedValueOnce({
        data: { id: 'x' },
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        error: {
          error: { code: 'CONFLICT', message: 'boom', retryable: false, correlationId: 'c' },
        },
        response: new Response(null, { status: 409 }),
      });

    renderScreen();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all students' }));
    await userEvent.click(screen.getByRole('combobox', { name: /target class/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'SS2B' }));
    await userEvent.click(screen.getByRole('button', { name: /move 2 students/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '1 student moved successfully, 1 failed',
      );
    });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('searches by student ID and keeps ticks on students the search hides', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('checkbox', { name: /select ada okoye/i }));
    await user.type(screen.getByRole('searchbox', { name: /search students/i }), 'ST002');
    expect(screen.queryByText('Ada Okoye')).not.toBeInTheDocument();
    expect(screen.getByText('Bola Ade')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /select all students shown/i }));
    await user.clear(screen.getByRole('searchbox', { name: /search students/i }));
    expect(screen.getByRole('checkbox', { name: /select ada okoye/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select bola ade/i })).toBeChecked();
  });
});
