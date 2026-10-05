import type { Role } from '@atlas/domain';

/**
 * ADR-0035 decision 5: which guide each working screen's "Help" link opens.
 * `roles` lists the workspaces the screen appears in; the link renders only
 * there, and a test checks every role's guide set contains `guideId`.
 */
export const CONTEXTUAL_GUIDES = {
  examBuilder: { guideId: 'build-an-exam', topic: 'building an exam', roles: ['TEACHER'] },
  questionEditor: { guideId: 'write-a-question', topic: 'writing a question', roles: ['TEACHER'] },
  questionImport: {
    guideId: 'import-questions',
    topic: 'importing questions',
    roles: ['TEACHER'],
  },
  teacherImport: {
    guideId: 'add-teachers',
    topic: 'adding teachers',
    roles: ['SCHOOL_ADMIN', 'MODERATOR'],
  },
  studentImport: {
    guideId: 'add-students',
    topic: 'adding students',
    roles: ['SCHOOL_ADMIN', 'MODERATOR'],
  },
  questionReview: { guideId: 'review-questions', topic: 'reviewing questions', roles: ['HOD'] },
  examControl: {
    guideId: 'run-a-sitting',
    topic: 'running an exam sitting',
    roles: ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER'],
  },
  makeup: {
    guideId: 'makeup',
    topic: 'makeup attempts',
    roles: ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER'],
  },
  results: {
    guideId: 'publish-results',
    topic: 'publishing results',
    roles: ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER'],
  },
  rollover: {
    guideId: 'rollover',
    topic: 'moving to a new academic session',
    roles: ['SCHOOL_ADMIN', 'MODERATOR'],
  },
} as const satisfies Record<string, { guideId: string; topic: string; roles: readonly Role[] }>;

export type HelpContext = keyof typeof CONTEXTUAL_GUIDES;
