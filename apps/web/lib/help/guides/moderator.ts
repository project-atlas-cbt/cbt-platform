import type { RoleGuideSet } from '../types';
import { schoolOfficeGuides, schoolResultsGuides } from './school-office';
import { examDayGuides, makeupGuide, ownAccountGuides } from './shared';

const control = { label: 'Exam Operations', href: 'exam-operations' };

/** ADR-0035 — the moderator's guides. */
export const MODERATOR_GUIDES: RoleGuideSet = {
  role: 'MODERATOR',
  guides: [
    ...schoolOfficeGuides(),
    {
      id: 'move-many-students',
      title: 'Move several students to another class at once',
      summary: 'Rebalance arms or fix a batch of students placed in the wrong class.',
      area: 'people',
      keywords: ['move students', 'bulk', 'change class', 'rebalance', 'arm'],
      requires: ['assignments.moveStudent'],
      steps: [
        'Open **Academics**, then **Classes**, and press **Move students** on the class they are in now.',
        'Tick the students, or **Select all students**.',
        'Choose the target class under **Move selected students to…** and press the **Move … students** button.',
      ],
      screen: { label: 'Classes', href: 'academics/classes' },
      related: ['move-student'],
    },
    ...examDayGuides(control),
    makeupGuide(control, 'exam-operations/makeup-access'),
    ...ownAccountGuides(),
    ...schoolResultsGuides(),
  ],
};
