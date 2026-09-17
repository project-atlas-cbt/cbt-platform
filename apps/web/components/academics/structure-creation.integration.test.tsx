import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionsScreen } from './sessions/sessions-screen';
import { TermsScreen } from './terms/terms-screen';
import { DepartmentsScreen } from './departments/departments-screen';
import { ClassesScreen } from './classes/classes-screen';
import { SubjectsScreen } from './subjects/subjects-screen';
import { ClassSubjectList } from './class-subjects/class-subject-list';
import { apiClient } from '@/lib/api';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn(() => true) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

/**
 * RTL substitute for the roadmap's own named E2E row ("Create session →
 * terms → departments → classes → subjects → offerings") — Browser E2E
 * remains deferred, per every prior phase's own recorded precedent (no
 * Playwright/E2E infra exists anywhere in this repo). Mirrors
 * `app/onboarding/resumability.integration.test.tsx`'s technique: mock only
 * `apiClient` at the HTTP boundary, drive real components through real user
 * interactions, and prove each step's result is visible to the *next*
 * screen via one shared `QueryClient` — the same cache
 * `invalidateAcademics` (`lib/academics/mutations.ts`) invalidates broadly
 * on every write.
 */
describe('F6 structure creation', () => {
  // The one piece of "server" state this test simulates, mutated by the
  // mocked POST calls and read back by the mocked GET calls.
  const state = {
    sessions: [] as {
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      status: string;
    }[],
    terms: [] as {
      id: string;
      academicSessionId: string;
      name: string;
      sequence: number;
      startDate: string;
      endDate: string;
      status: string;
    }[],
    departments: [] as { id: string; name: string; code: string; status: string }[],
    classes: [] as {
      id: string;
      academicSessionId: string;
      departmentId: string | null;
      name: string;
      level: string;
      arm: string;
      status: string;
    }[],
    subjects: [] as {
      id: string;
      name: string;
      code: string;
      departmentId: string | null;
      status: string;
    }[],
    classSubjects: [] as {
      id: string;
      classId: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      academicSessionId: string;
      status: string;
    }[],
  };
  let nextId = 1;

  beforeEach(() => {
    state.sessions = [];
    state.terms = [];
    state.departments = [];
    state.classes = [];
    state.subjects = [];
    state.classSubjects = [];
    nextId = 1;
    vi.mocked(useHasPermission).mockReturnValue(true);

    mockGet.mockImplementation((path: string, options?: unknown) => {
      const opts = options as {
        params?: { path?: Record<string, string>; query?: Record<string, string> };
      };
      switch (path) {
        case '/academics/sessions':
          return ok({ sessions: state.sessions });
        case '/academics/sessions/{sessionId}/terms':
          return ok({
            terms: state.terms.filter((t) => t.academicSessionId === opts.params?.path?.sessionId),
          });
        case '/academics/departments':
          return ok({ departments: state.departments });
        case '/academics/classes': {
          const sessionId = opts.params?.query?.academicSessionId;
          return ok({
            classes: sessionId
              ? state.classes.filter((c) => c.academicSessionId === sessionId)
              : state.classes,
          });
        }
        case '/academics/subjects':
          return ok({ subjects: state.subjects });
        case '/academics/classes/{id}/subjects':
          return ok({
            offerings: state.classSubjects.filter((cs) => cs.classId === opts.params?.path?.id),
          });
        case '/academics/context': {
          const current = state.sessions.find((s) => s.status === 'CURRENT');
          return ok({
            schoolId: 'sch1',
            schoolName: 'Test School',
            session: current
              ? { id: current.id, name: current.name, status: current.status }
              : null,
            term: null,
          });
        }
        default:
          return ok({});
      }
    });

    mockPost.mockImplementation((path: string, options?: unknown) => {
      const opts = options as {
        params?: { path?: Record<string, string> };
        body?: Record<string, unknown>;
      };
      const body = opts.body ?? {};
      switch (path) {
        case '/academics/sessions': {
          const session = {
            id: `session-${nextId++}`,
            name: body.name as string,
            startDate: body.startDate as string,
            endDate: body.endDate as string,
            status: 'DRAFT',
          };
          state.sessions.push(session);
          return ok(session);
        }
        case '/academics/sessions/{id}/activate': {
          const id = opts.params?.path?.id as string;
          state.sessions = state.sessions.map((s) => ({
            ...s,
            status: s.id === id ? 'CURRENT' : s.status === 'CURRENT' ? 'CLOSED' : s.status,
          }));
          return ok(state.sessions.find((s) => s.id === id));
        }
        case '/academics/sessions/{sessionId}/terms': {
          const sessionId = opts.params?.path?.sessionId as string;
          const term = {
            id: `term-${nextId++}`,
            academicSessionId: sessionId,
            name: body.name as string,
            sequence: body.sequence as number,
            startDate: body.startDate as string,
            endDate: body.endDate as string,
            status: 'DRAFT',
          };
          state.terms.push(term);
          return ok(term);
        }
        case '/academics/departments': {
          const department = {
            id: `dept-${nextId++}`,
            name: body.name as string,
            code: body.code as string,
            status: 'ACTIVE',
          };
          state.departments.push(department);
          return ok(department);
        }
        case '/academics/classes': {
          const classGroup = {
            id: `class-${nextId++}`,
            academicSessionId: body.academicSessionId as string,
            departmentId: (body.departmentId as string | undefined) ?? null,
            name: body.name as string,
            level: body.level as string,
            arm: body.arm as string,
            status: 'ACTIVE',
          };
          state.classes.push(classGroup);
          return ok(classGroup);
        }
        case '/academics/subjects': {
          const subject = {
            id: `subject-${nextId++}`,
            name: body.name as string,
            code: body.code as string,
            departmentId: (body.departmentId as string | undefined) ?? null,
            status: 'ACTIVE',
          };
          state.subjects.push(subject);
          return ok(subject);
        }
        case '/academics/classes/{id}/subjects': {
          const classId = opts.params?.path?.id as string;
          const subject = state.subjects.find((s) => s.id === body.subjectId);
          const classGroup = state.classes.find((c) => c.id === classId)!;
          const offering = {
            id: `cs-${nextId++}`,
            classId,
            subjectId: subject!.id,
            subjectName: subject!.name,
            subjectCode: subject!.code,
            academicSessionId: classGroup.academicSessionId,
            status: 'ACTIVE',
          };
          state.classSubjects.push(offering);
          return ok(offering);
        }
        default:
          return ok({});
      }
    });
  });

  // Six full mount/interact/unmount cycles in one test — genuinely heavier
  // than the 5s default, and this project's own established pattern for
  // "environment flakiness under full-suite parallel load" (see CLAUDE.md's
  // Change Log) is to give the test the headroom it needs rather than treat a
  // slow-but-correct run as a failure. Hence the explicit 20000ms timeout
  // passed as this it()'s third argument.
  it('creates a full academic structure end to end, each step visible to the next screen via the shared cache', async () => {
    const client = new QueryClient();
    const wrap = (ui: React.ReactElement) => (
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    );

    // 1. Create and activate a session.
    const sessionsRender = render(wrap(<SessionsScreen />));
    await userEvent.click(screen.getAllByRole('button', { name: /add session/i })[0]!);
    await userEvent.type(screen.getByLabelText(/session name/i), '2026/2027');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2027-07-31');
    await userEvent.click(screen.getByRole('button', { name: /create session/i }));
    await screen.findByText('2026/2027');

    await userEvent.click(screen.getByRole('button', { name: /actions for 2026\/2027/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /set as current/i }));
    await userEvent.click(screen.getByRole('button', { name: /^set as current$/i }));
    await waitFor(() => expect(state.sessions[0]?.status).toBe('CURRENT'));
    sessionsRender.unmount();

    // 2. Terms screen picks up the now-current session automatically and lists no terms yet.
    const termsRender = render(wrap(<TermsScreen />));
    await screen.findByText('No terms in this session yet');
    await userEvent.click(screen.getAllByRole('button', { name: /add term/i })[0]!);
    await userEvent.type(screen.getByLabelText(/term name/i), 'First Term');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-15');
    await userEvent.click(screen.getByRole('button', { name: /create term/i }));
    await screen.findByText(/First Term/);
    expect(state.terms).toHaveLength(1);
    expect(state.terms[0]?.academicSessionId).toBe(state.sessions[0]?.id);
    termsRender.unmount();

    // 3. Department.
    const departmentsRender = render(wrap(<DepartmentsScreen basePath="/school/academics" />));
    await userEvent.click(screen.getAllByRole('button', { name: /add department/i })[0]!);
    await userEvent.type(screen.getByLabelText(/department name/i), 'Sciences');
    await userEvent.type(screen.getByLabelText(/code/i), 'SCI');
    await userEvent.click(screen.getByRole('button', { name: /create department/i }));
    await screen.findByText('Sciences');
    departmentsRender.unmount();

    // 4. Class — the just-created department is available in its picker.
    const classesRender = render(wrap(<ClassesScreen basePath="/school/academics" />));
    await screen.findByText('No classes in this session yet');
    await userEvent.click(screen.getAllByRole('button', { name: /add class/i })[0]!);
    await userEvent.type(screen.getByLabelText(/arm/i), 'A');
    await userEvent.type(screen.getByLabelText(/class name/i), 'SS2A');
    await userEvent.click(screen.getByRole('combobox', { name: /department/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Sciences' }));
    await userEvent.click(screen.getByRole('button', { name: /create class/i }));
    await screen.findByText('SS2A');
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0]?.departmentId).toBe(state.departments[0]?.id);
    classesRender.unmount();

    // 5. Subject.
    const subjectsRender = render(wrap(<SubjectsScreen />));
    await userEvent.click(screen.getAllByRole('button', { name: /add subject/i })[0]!);
    await userEvent.type(screen.getByLabelText(/subject name/i), 'Mathematics');
    await userEvent.type(screen.getByLabelText(/code/i), 'MTH');
    await userEvent.click(screen.getByRole('button', { name: /create subject/i }));
    await screen.findByText('Mathematics');
    subjectsRender.unmount();

    // 6. Offer the subject to the class.
    const classId = state.classes[0]!.id;
    render(wrap(<ClassSubjectList classId={classId} />));
    await screen.findByText('No subjects offered yet');
    await userEvent.click(screen.getByRole('combobox', { name: /choose a subject/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Mathematics' }));
    await userEvent.click(screen.getByRole('button', { name: /offer subject/i }));
    await screen.findByText(/Mathematics/);
    expect(state.classSubjects).toHaveLength(1);
    expect(state.classSubjects[0]?.classId).toBe(classId);
    expect(state.classSubjects[0]?.subjectId).toBe(state.subjects[0]?.id);
  }, 20000);
});
