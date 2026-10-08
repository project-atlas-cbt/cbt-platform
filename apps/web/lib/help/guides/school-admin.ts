import type { RoleGuideSet } from '../types';
import { schoolOfficeGuides, schoolResultsGuides } from './school-office';
import { examDayGuides, makeupGuide, ownAccountGuides } from './shared';

const control = { label: 'Exam Operations', href: 'exam-operations' };

/** ADR-0035 — the school admin's guides. */
export const SCHOOL_ADMIN_GUIDES: RoleGuideSet = {
  role: 'SCHOOL_ADMIN',
  guides: [
    {
      id: 'finish-setup',
      title: 'Set up the school for the first time',
      summary: 'The setup steps that appear after you activate the school.',
      area: 'setup',
      keywords: ['onboarding', 'setup', 'wizard', 'activate', 'first time', 'getting started'],
      requires: ['schoolConfig.onboarding.manage'],
      steps: [
        'After activating with the emailed key, sign in. The setup steps open by themselves.',
        'Work through them in order: profile, branding, academic session, terms, departments, classes, subjects, staff, students. **Skip for now** leaves an optional step for later.',
        'Review the summary and press **Complete Setup**. You need a current session and at least one class.',
      ],
      notes: [
        'Everything set here can be changed later under **Academics**, **People** and **School Settings**.',
        'Before the first real exam, run a short practice exam in the lab with one class.',
      ],
      related: ['classes-and-subjects', 'add-teachers', 'add-students'],
    },
    {
      id: 'school-profile',
      title: 'Update the school’s details, logo and colour',
      summary: 'Change the school name, contacts, logo or the colour staff and students see.',
      area: 'setup',
      keywords: ['profile', 'logo', 'colour', 'color', 'branding', 'address', 'contact'],
      requires: ['schoolConfig.profile.edit'],
      steps: [
        'Open **School Settings**.',
        'On **Profile**, edit the school’s name and contact details, then press **Save profile**.',
        'On **Branding**, upload the logo and pick the primary colour, then press **Save branding**.',
      ],
      notes: [
        'The school’s address on the web and its timezone are set by {product} and cannot be changed here.',
      ],
      screen: { label: 'School Settings', href: 'settings/profile' },
    },
    {
      id: 'result-policy',
      title: 'Choose who releases results',
      summary: 'Set the school’s default for publishing results and what students see.',
      area: 'setup',
      keywords: ['result policy', 'publish', 'release', 'students see', 'lock'],
      requires: ['schoolConfig.settings.manage'],
      steps: [
        'Open **School Settings**, then **Results**.',
        'Choose **Who releases results by default** and **What students see once a result is released**.',
        'Tick **Lock these settings** if teachers must not change either setting on their own exams. While locked, every exam follows the school’s settings, including exams made before you locked them.',
        'Press **Save result policy**.',
      ],
      screen: { label: 'Result settings', href: 'settings/results' },
      related: ['publish-results', 'grading-scale'],
    },
    {
      id: 'exam-defaults',
      title: 'Set the default rules for new exams',
      summary:
        'Choose the duration, attempts, navigation and shuffling every new exam starts with.',
      area: 'setup',
      keywords: [
        'assessment rules',
        'default',
        'duration',
        'attempts',
        'navigation',
        'shuffle',
        'randomize',
      ],
      requires: ['schoolConfig.settings.manage'],
      steps: [
        'Open **School Settings**, then **Assessment Rules**.',
        'Enter the **Duration (minutes)** and **Number of attempts**, choose the **Question navigation**, and tick the randomization options you want.',
        'Press **Save assessment rules**.',
      ],
      notes: [
        'These are starting values only. Teachers can still change each rule on their own exam before it is ready.',
        'Exams already created keep their own rules.',
      ],
      screen: { label: 'Assessment Rules', href: 'settings/assessment' },
      related: ['result-policy'],
    },
    {
      id: 'grading-scale',
      title: 'Set the grading bands',
      summary: 'Choose the grade each percentage earns and which grades count as a pass.',
      area: 'setup',
      keywords: ['grading', 'grade', 'bands', 'scale', 'pass mark', 'ungraded', 'A B C'],
      requires: ['schoolConfig.settings.manage'],
      steps: [
        'Open **School Settings**, then **Results**, and find **Grading scale**.',
        'With **Scale for** set to **All classes (school-wide)**, check each grade’s **From %** and **To %**, and tick **Pass** for the grades that count as a pass. The default bands are only a starting point.',
        'Use **Add grade** or the remove button to change the number of grades. Every percentage from 0 to 100 must fall in exactly one grade.',
        'Press **Save grading scale** (or **Save as version …** when changing a saved scale).',
        'If a class level grades differently, choose it under **Scale for** and press **Give … its own scale**, then edit and save. Other levels keep using the school-wide scale.',
      ],
      notes: [
        'Set the bands before the first exam is marked. A grade is worked out once, when a result is finalised, so results finalised with no scale show **Ungraded** and have no pass rate.',
        'If results came out **Ungraded** because the bands were not set yet, set them, then open that exam under **Results** and press **Grade now**. Only the ungraded results are graded, with the bands in place now; results that already have a grade keep it. A result is graded only when there are bands for its class level or for the whole school; any other stays ungraded until you add them.',
        'Saving creates a new version. Grades already given never change; only results finalised afterwards use the new bands. **Version history** shows which versions have been used for grades.',
        'Once a class level has its own scale it can be changed but not removed.',
      ],
      screen: { label: 'Result settings', href: 'settings/results' },
      related: ['result-policy', 'publish-results'],
    },
    {
      id: 'subscription',
      title: 'Check the subscription',
      summary: 'See when the school’s access expires and what happens after.',
      area: 'setup',
      keywords: ['subscription', 'renew', 'expiry', 'expired', 'payment', 'plan'],
      requires: ['subscription.view'],
      steps: [
        'Open **School Settings**, then **Subscription**, to see the plan, status, expiry date and days remaining.',
        'To renew, contact {product} support (details below).',
      ],
      notes: [
        'When a subscription expires, the school keeps read access to its records for 14 days. Exams already running finish and are marked, but nothing new can start.',
        'No academic records are ever deleted because a subscription expired.',
      ],
      screen: { label: 'Subscription', href: 'settings/subscription' },
    },
    {
      id: 'add-moderators',
      title: 'Add a moderator',
      summary:
        'Give a member of staff moderator access to manage people, classes and exam operations.',
      area: 'people',
      keywords: ['moderator', 'exam officer', 'add staff', 'access'],
      requires: ['users.moderator.create'],
      steps: [
        'Open **People**, then **Moderators**, and press **Add moderator**.',
        'Enter their name, email and login identifier, and press **Add moderator**.',
      ],
      notes: ['**Remove access** on their row takes moderator access away.'],
      screen: { label: 'Moderators', href: 'people/moderators' },
    },
    ...schoolOfficeGuides(),
    ...examDayGuides(control),
    makeupGuide(control, 'exam-operations/makeup-access'),
    ...ownAccountGuides(),
    ...schoolResultsGuides(),
    {
      id: 'override-marks',
      title: 'Correct one student’s marks',
      summary: 'Make a recorded, justified change to a single result.',
      area: 'results',
      keywords: ['override', 'change score', 'correct marks', 'remark'],
      requires: ['results.manualOverride'],
      steps: [
        'Open **Results**, choose the exam and open the student’s result.',
        'Press **Override marks**, enter the marks awarded and the reason, and press **Apply adjustment**.',
      ],
      notes: [
        'The original score is kept and the change is audited.',
        'For a mistake in a question that affects everyone, correct the question instead.',
      ],
      screen: { label: 'Results', href: 'results' },
      related: ['adjust-a-question'],
    },
  ],
};
