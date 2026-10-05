import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuestionEditorScreen } from './question-editor-screen';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  // HelpLink (ADR-0035) reads the path; outside a workspace it renders nothing.
  usePathname: () => '/',
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);
const mockPatch = vi.mocked(apiClient.PATCH);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

const REVISION = {
  id: 'rev1',
  revisionNumber: 1,
  questionType: 'SINGLE_CHOICE',
  content: '<p>2 + 2 = ?</p>',
  topicId: null,
  topicName: null,
  subtopicId: null,
  subtopicName: null,
  difficulty: 'EASY',
  marks: 2,
  explanation: null,
  createdByMembershipId: 'mem1',
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  options: [
    { id: 'o1', content: '4', originalOrder: 0, correctFlag: true },
    { id: 'o2', content: '3', originalOrder: 1, correctFlag: false },
  ],
  media: [],
};

const QUESTION = {
  id: 'q1',
  subjectId: 'sub1',
  subjectName: 'Mathematics',
  level: 'SS2',
  topicId: null,
  topicName: null,
  difficulty: 'EASY',
  marks: 2,
  questionType: 'SINGLE_CHOICE',
  currentStatus: 'DRAFT',
  authorTeacherProfileId: 'tp1',
  authorName: 'Ada Okoye',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  archivedAt: null,
  revisions: [REVISION],
};

function wrap(ui: React.ReactElement) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

/**
 * F9 DoD-mandated integration coverage: create → autosave draft → submit →
 * status reflects, over the real `QuestionEditorScreen` component, mocking
 * only `apiClient` at the HTTP boundary — the same technique
 * `structure-creation.integration.test.tsx`/F8's own bulk-import
 * integration tests already established. Real 800ms debounce timers run
 * for real (no fake timers), so assertions use a generously extended
 * `waitFor` timeout, matching this codebase's own "give a correct-but-heavy
 * test the headroom it needs" precedent.
 */
describe('QuestionEditorScreen — create, autosave, submit (F9)', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();

    mockGet.mockImplementation((path: string) => {
      // Gap-closure (found via live testing): `MetadataPanel` sources the
      // Subject picker from `useAssignedSubjects` (`GET /questions/
      // assigned-subjects`), not `GET /academics/subjects` — the latter is
      // denied to TEACHER. See `MetadataPanel`'s own doc comment.
      if (path === '/questions/assigned-subjects') {
        return ok({
          subjects: [
            { id: 'sub1', name: 'Mathematics', code: 'MTH', departmentId: null, status: 'ACTIVE' },
          ],
        });
      }
      if (path === '/academics/departments') return ok({ departments: [] });
      if (path === '/topics') return ok({ topics: [] });
      return ok({});
    });

    mockPost.mockImplementation((path: string) => {
      if (path === '/questions') return ok(QUESTION);
      if (path === '/questions/{questionId}/revisions/{revisionId}/submit') {
        return ok({ ...REVISION, status: 'SUBMITTED' });
      }
      return ok({});
    });

    mockPatch.mockImplementation(() => ok(REVISION));
  });

  // Extended timeout (Vitest's default is 5000ms): this one test drives
  // three real Select interactions, character-by-character typing into a
  // live Tiptap/ProseMirror editor, and two genuine 800ms autosave
  // debounce windows in sequence — correct but heavier than this
  // codebase's other tests, the same reasoning
  // `structure-creation.integration.test.tsx`'s own multi-step walk
  // already established for a slow-but-correct test needing real headroom.
  // 60000ms (raised from 20000ms, which tripped under full-suite parallel
  // CPU contention).
  it('auto-creates the question once the minimum-viable fields are filled, then autosaves further edits via PATCH, then submits', async () => {
    render(wrap(<QuestionEditorScreen />));

    await screen.findByLabelText('Subject');
    await userEvent.click(screen.getByRole('combobox', { name: /subject/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Mathematics' }));
    await userEvent.click(screen.getByRole('combobox', { name: /class level/i }));
    await userEvent.click(screen.getByRole('option', { name: 'SS2' }));
    await userEvent.click(screen.getByRole('combobox', { name: /^difficulty$/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Easy' }));
    await userEvent.type(screen.getByLabelText('Marks'), '2');

    const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
    await userEvent.click(editable);
    await userEvent.type(editable, '2 + 2 = ?');

    await userEvent.type(screen.getByLabelText('Option 1 text'), '4');
    await userEvent.type(screen.getByLabelText('Option 2 text'), '3');

    // The autosave gate fires POST /questions once every required field is
    // genuinely present — DoD "draft autosave prevents work loss." Asserted
    // via a plain call lookup rather than a nested `expect.objectContaining`
    // (which TS widens to `any` two levels deep) — `toMatchObject` gives the
    // same partial-match intent without it.
    await waitFor(
      () => {
        const calls = mockPost.mock.calls as unknown as [
          string,
          { body: Record<string, unknown> },
        ][];
        const call = calls.find(([path]) => path === '/questions');
        expect(call).toBeDefined();
        expect(call?.[1].body).toMatchObject({
          subjectId: 'sub1',
          level: 'SS2',
          difficulty: 'EASY',
        });
      },
      { timeout: 10000 },
    );
    // The URL transitions from /new to /:id/edit (replace, not push).
    expect(replace).toHaveBeenCalledWith('/teacher/question-bank/q1/edit');

    // A further edit after creation autosaves via PATCH, not another POST.
    mockPost.mockClear();
    await userEvent.type(editable, ' really');
    await waitFor(
      () => {
        expect(mockPatch).toHaveBeenCalledWith(
          '/questions/{questionId}/revisions/{revisionId}',
          expect.objectContaining({ params: { path: { questionId: 'q1', revisionId: 'rev1' } } }),
        );
      },
      { timeout: 10000 },
    );
    expect(mockPost).not.toHaveBeenCalledWith('/questions', expect.anything());

    // Submitting calls the real submit route and navigates to the detail screen.
    const submitButton = await screen.findByRole('button', { name: /submit for review/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled(), { timeout: 3000 });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/questions/{questionId}/revisions/{revisionId}/submit',
        expect.objectContaining({ params: { path: { questionId: 'q1', revisionId: 'rev1' } } }),
      );
    });
    expect(push).toHaveBeenCalledWith('/teacher/question-bank/q1');
  }, 60000);
});
