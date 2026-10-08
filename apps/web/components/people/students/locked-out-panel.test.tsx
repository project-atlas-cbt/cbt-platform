import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LockedOutPanel } from './locked-out-panel';

const state = vi.hoisted(() => ({
  students: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
}));

vi.mock('@/lib/people/queries', () => ({
  useLockedOutStudents: () => ({ data: { students: state.students } }),
}));
vi.mock('@/lib/people/mutations', () => ({
  useUnlockStudentSignIn: () => ({ mutate: state.mutate, isPending: false, variables: undefined }),
}));

const ada = {
  studentProfileId: 'p1',
  displayName: 'Ada Obi',
  loginIdentifier: 'OLA-001',
  currentClassName: 'SS2A',
};

describe('LockedOutPanel', () => {
  beforeEach(() => {
    state.mutate.mockReset();
  });

  it('renders nothing while nobody is locked out', () => {
    state.students = [];
    const { container } = render(<LockedOutPanel basePath="/school" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists locked-out students and unlocks one', async () => {
    state.students = [ada, { ...ada, studentProfileId: 'p2', displayName: 'Ben Eze' }];
    render(<LockedOutPanel basePath="/school" />);
    expect(screen.getByText('2 students are locked out of sign-in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada Obi' })).toHaveAttribute(
      'href',
      '/school/students/p1',
    );
    await userEvent.click(screen.getAllByRole('button', { name: /Unlock/ })[0]!);
    expect(state.mutate).toHaveBeenCalledWith('p1', expect.any(Object));
  });
});
