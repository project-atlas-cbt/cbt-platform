/**
 * The pre-onboarding guide's single source: the /get-started page and the PDF
 * schools receive with their activation email are both rendered from this.
 * Keep it true of the real wizard (apps/web/lib/onboarding/steps-config.ts)
 * and the import templates (apps/api/src/modules/imports/import-templates.ts).
 */
export interface PrepSection {
  id: string;
  title: string;
  /** Marks the part the wizard cannot be finished without. */
  required?: string;
  items: string[];
  note?: string;
  columns?: { label: string; headers: string[] };
}

export const activationLinkDays = 14;

export const roles = [
  {
    who: 'School admin',
    what: 'The person who receives the activation email. Does the setup, ideally on a computer rather than a phone.',
  },
  {
    who: 'Lab contact',
    what: 'Looks after the computers on exam day. They need no part in the setup itself.',
  },
];

export const prepSections: PrepSection[] = [
  {
    id: 'school',
    title: 'About the school',
    items: [
      'School name as students should see it, and a short name or abbreviation',
      'Contact email, phone number and address',
      'Your logo as a clear PNG or JPG file, and your school colour if you have one (both optional, can be added later)',
    ],
  },
  {
    id: 'calendar',
    title: 'Your academic calendar',
    required: 'Required: the setup cannot be finished without a current academic session.',
    items: [
      'Name of the current academic session (for example 2026/2027) with its start and end dates',
      'Your terms: name, order (1, 2, 3), start and end dates',
    ],
  },
  {
    id: 'structure',
    title: 'How the school is organised',
    required: 'Required: at least one class.',
    items: [
      'The classes you will use, by level and arm (JSS1 to SS3, with arms such as A, B, C)',
      'Departments. Most schools use Science, Business and Humanities; you can start from our standard setup and remove what you do not need',
      'The subjects each class offers, and whether each is compulsory, elective, or for one stream only. Electives can be filled in later by form teachers',
      'Which teacher heads each department (HOD), because the HOD reviews the questions for that department’s subjects',
    ],
  },
  {
    id: 'teachers',
    title: 'Your teachers',
    items: [
      'One spreadsheet row per teacher. Every teacher needs their own working email address: their invitation goes there',
      'Tell teachers to expect the invitation. Its link works for one hour; if it lapses, you can send a fresh one',
    ],
    columns: {
      label: 'Teacher spreadsheet columns',
      headers: ['Staff ID', 'Surname', 'First Name', 'Middle Name (optional)', 'Email'],
    },
    note: 'Download the exact template from Imports → Teachers inside the app, and keep its column names.',
  },
  {
    id: 'students',
    title: 'Your students',
    items: [
      'One spreadsheet row per student, with the class written exactly as you named it in the app',
      'Students need no email address. Their first passwords come on a printed sheet per class: print it only when that class is about to sign in, hand each student their own slip, and shred what is left the same day',
    ],
    columns: {
      label: 'Student spreadsheet columns',
      headers: [
        'Student ID',
        'Surname',
        'First Name',
        'Middle Name (optional)',
        'Class',
        'Stream (optional)',
        'Electives (optional, separated by ;)',
      ],
    },
    note: 'Download the exact template from Imports → Students inside the app.',
  },
  {
    id: 'before-exam',
    title: 'Before your first exam',
    items: [
      'Your grading bands and pass mark. Set them in School Settings → Results before the first exam is marked: results marked earlier stay ungraded',
      'A first set of questions. Teachers can type them in or import a spreadsheet, and the HOD approves them before they can go into an exam',
      'Which lab computers you will use. Each one opens your school’s address once beforehand, and you run a short practice sitting with one class before the real exam',
    ],
  },
];

export const wizardSteps = [
  'School profile',
  'Branding',
  'Academic session',
  'Terms',
  'Departments',
  'Classes',
  'Subjects',
  'Staff',
  'Students',
  'Review and finish',
];

export const checklist = [
  'School name, short name, email, phone, address',
  'Logo file (optional)',
  'Session name and dates; term names and dates',
  'List of classes (level and arm)',
  'Departments, subjects per class, and an HOD per department',
  'Teacher spreadsheet with working emails',
  'Student spreadsheet with a class for every student',
  'Grading bands and pass mark',
  'First set of questions',
  'Lab contact and list of lab computers',
];
