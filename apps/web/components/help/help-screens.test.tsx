import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleGuideSet } from '@/lib/help/types';
import { HelpCentreScreen } from './help-centre-screen';
import { GuideScreen } from './guide-screen';
import { HelpLink } from './help-link';
import { SupportContact } from './support-contact';

let pathname = '/teacher/exam-control/x';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const permissions = vi.hoisted(() => ({
  state: {
    data: undefined as { permissions: { resource: string; breakGlass?: boolean }[] } | undefined,
    isLoading: false,
    isError: false,
  },
}));
vi.mock('@/lib/nav', async () => {
  const actual = await vi.importActual<typeof import('@/lib/nav')>('@/lib/nav');
  return { ...actual, usePermissions: () => permissions.state };
});

const SET: RoleGuideSet = {
  role: 'TEACHER',
  guides: [
    {
      id: 'build-an-exam',
      title: 'Build an exam',
      summary: 'Create an exam in four steps.',
      area: 'exams',
      keywords: ['test'],
      requires: ['exam.create'],
      steps: ['Open **Exams** and press **New exam**.', 'Sign in to {product}.'],
      notes: ['A Ready exam does nothing until a session opens.'],
      screen: { label: 'Exams', href: 'exams' },
      related: ['own-password'],
    },
    {
      id: 'makeup',
      title: 'Give an absent student a makeup attempt',
      summary: 'Let a student who missed an exam sit it later.',
      area: 'running',
      keywords: ['missed'],
      requires: ['examAdmin.grantMakeup'],
      steps: ['Press **Grant makeup access**.'],
    },
    {
      id: 'own-password',
      title: 'Change or reset your own password',
      summary: 'You forgot your password.',
      area: 'people',
      keywords: ['forgot'],
      requires: [],
      steps: ['Press **Forgot your password?**.'],
    },
  ],
};

function grant(...resources: string[]) {
  permissions.state = {
    data: { permissions: resources.map((resource) => ({ resource })) },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  grant('exam.create');
  pathname = '/teacher/exam-control/x';
});

describe('HelpCentreScreen', () => {
  it('lists only the guides the user has permission for, grouped by area', () => {
    render(<HelpCentreScreen set={SET} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Build an exam/ })).toHaveAttribute(
      'href',
      '/teacher/help/build-an-exam',
    );
    expect(screen.getByRole('link', { name: /own password/ })).toBeInTheDocument();
    expect(screen.queryByText(/makeup attempt/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Building exams' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Running an exam' })).not.toBeInTheDocument();
  });

  it('searches the visible guides and explains when nothing matches', async () => {
    const user = userEvent.setup();
    render(<HelpCentreScreen set={SET} />);
    const search = screen.getByRole('searchbox', { name: 'Search help' });

    await user.type(search, 'forgot');
    expect(screen.getByRole('heading', { name: '1 guide match' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /own password/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Build an exam/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'missed');
    expect(screen.getByText('No guide matches that search')).toBeInTheDocument();
  });

  it('shows a skeleton while permissions load', () => {
    permissions.state = { data: undefined, isLoading: true, isError: false };
    render(<HelpCentreScreen set={SET} />);
    expect(screen.getByLabelText('Loading guides')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeDisabled();
  });

  it('shows every guide in the role set when permissions fail to load', () => {
    permissions.state = { data: undefined, isLoading: false, isError: true };
    render(<HelpCentreScreen set={SET} />);
    expect(screen.getByRole('link', { name: /makeup attempt/ })).toBeInTheDocument();
  });
});

describe('GuideScreen', () => {
  it('renders numbered steps with button names, the product name and a link to the screen', () => {
    render(<GuideScreen set={SET} guideId="build-an-exam" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Build an exam' })).toBeInTheDocument();
    const steps = within(document.querySelector('ol')!).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(within(steps[0]!).getByText('New exam').tagName).toBe('STRONG');
    expect(steps[1]).toHaveTextContent('Sign in to CBT Platform.');
    expect(screen.getByRole('heading', { name: 'Good to know' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Exams/ })).toHaveAttribute(
      'href',
      '/teacher/exams',
    );
    expect(screen.getByRole('link', { name: 'Change or reset your own password' })).toHaveAttribute(
      'href',
      '/teacher/help/own-password',
    );
  });

  it('does not show a guide the user lacks permission for', () => {
    render(<GuideScreen set={SET} guideId="makeup" />);
    expect(screen.getByText("This guide isn't available")).toBeInTheDocument();
    expect(screen.queryByText('Grant makeup access')).not.toBeInTheDocument();
  });

  it('handles an unknown guide id', () => {
    render(<GuideScreen set={SET} guideId="nope" />);
    expect(screen.getByText("This guide isn't available")).toBeInTheDocument();
  });
});

describe('SupportContact', () => {
  it('shows each configured channel', () => {
    render(
      <SupportContact
        contacts={{
          email: 'help@example.com',
          whatsapp: '+234 801 234 5678',
          whatsappHref: 'https://wa.me/2348012345678',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'help@example.com' })).toHaveAttribute(
      'href',
      'mailto:help@example.com',
    );
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      'https://wa.me/2348012345678',
    );
  });

  it('points to the school admin only when no channel is configured', () => {
    render(<SupportContact contacts={{}} />);
    expect(screen.getByText(/Your school admin manages accounts/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('HelpLink', () => {
  it('links to the guide in the current workspace', () => {
    pathname = '/hod/exam-control/123';
    render(<HelpLink context="examControl" />);
    expect(screen.getByRole('link', { name: 'Help: running an exam sitting' })).toHaveAttribute(
      'href',
      '/hod/help/run-a-sitting',
    );
  });

  it('renders nothing in a workspace the guide is not written for', () => {
    pathname = '/school/questions';
    render(<HelpLink context="questionReview" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing for students', () => {
    pathname = '/student/assessment';
    render(<HelpLink context="results" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
