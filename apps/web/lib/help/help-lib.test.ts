import { describe, expect, it } from 'vitest';
import { supportContacts } from './config';
import { visibleGuides } from './filter';
import { searchGuides } from './search';
import type { Guide } from './types';

function guide(overrides: Partial<Guide> & Pick<Guide, 'id'>): Guide {
  return {
    title: overrides.id,
    summary: '',
    area: 'running',
    keywords: [],
    requires: [],
    steps: ['A step.'],
    ...overrides,
  };
}

describe('visibleGuides', () => {
  const guides = [
    guide({ id: 'everyone' }),
    guide({ id: 'makeup', requires: ['examAdmin.grantMakeup'] }),
    guide({ id: 'either', requires: ['users.teacher.create', 'users.student.create'] }),
  ];

  it('shows a guide when the user holds any of its permissions', () => {
    const ids = visibleGuides(guides, [{ resource: 'users.student.create' }]).map((g) => g.id);
    expect(ids).toEqual(['everyone', 'either']);
  });

  it('ignores break-glass grants, like the navigation does', () => {
    const ids = visibleGuides(guides, [
      { resource: 'examAdmin.grantMakeup', breakGlass: true },
    ]).map((g) => g.id);
    expect(ids).toEqual(['everyone']);
  });

  it('shows the whole role set when permissions could not be loaded', () => {
    expect(visibleGuides(guides, null)).toHaveLength(3);
  });
});

describe('searchGuides', () => {
  const guides = [
    guide({ id: 'a', title: 'Give an absent student a makeup attempt', keywords: ['missed'] }),
    guide({ id: 'b', title: 'Reset someone’s password', keywords: ['forgot', 'locked out'] }),
    guide({
      id: 'c',
      title: 'Run a sitting',
      steps: ['Students who **missed** it need a makeup.'],
    }),
  ];

  it('returns every guide for an empty query', () => {
    expect(searchGuides(guides, '   ')).toHaveLength(3);
  });

  it('matches word prefixes, case-insensitively', () => {
    expect(searchGuides(guides, 'PASS').map((g) => g.id)).toEqual(['b']);
  });

  it('requires every query word and ranks title matches above step matches', () => {
    expect(searchGuides(guides, 'makeup').map((g) => g.id)).toEqual(['a', 'c']);
    expect(searchGuides(guides, 'makeup forgot')).toEqual([]);
  });

  it('finds guides by keyword', () => {
    expect(searchGuides(guides, 'locked').map((g) => g.id)).toEqual(['b']);
  });
});

describe('supportContacts', () => {
  it('returns both channels when configured, with a wa.me link from the digits', () => {
    expect(supportContacts({ email: 'help@example.com', whatsapp: '+234 801 234 5678' })).toEqual({
      email: 'help@example.com',
      whatsapp: '+234 801 234 5678',
      whatsappHref: 'https://wa.me/2348012345678',
    });
  });

  it('leaves out unset or malformed channels', () => {
    expect(supportContacts({})).toEqual({});
    expect(supportContacts({ email: 'not-an-email', whatsapp: '123' })).toEqual({});
  });
});
