import type { Role } from '@atlas/domain';

/**
 * ADR-0035 — the in-app help centre's content model. A guide answers one
 * task ("Give a student a makeup attempt") in numbered steps that name the
 * real screen and button.
 *
 * Text fields support exactly two inline conventions, rendered by
 * `HelpText` without any HTML parsing: `**Button name**` for a control the
 * reader must find on screen, and `{product}` for the product name
 * (PRODUCT_NAME, never written literally).
 */
export type HelpArea =
  | 'setup'
  | 'people'
  | 'academics'
  | 'questions'
  | 'exams'
  | 'running'
  | 'results'
  | 'reports'
  | 'account';

export const HELP_AREA_LABELS: Record<HelpArea, string> = {
  setup: 'School setup',
  people: 'People and accounts',
  academics: 'Academic structure',
  questions: 'Questions',
  exams: 'Building exams',
  running: 'Running an exam',
  results: 'Results',
  reports: 'Reports and exports',
  account: 'Your account',
};

/** Display order of areas on the Help screen. */
export const HELP_AREA_ORDER: readonly HelpArea[] = [
  'setup',
  'people',
  'academics',
  'questions',
  'exams',
  'running',
  'results',
  'reports',
  'account',
];

export interface Guide {
  /** Kebab-case, unique within a role's guide set; the guide's URL segment. */
  id: string;
  title: string;
  /** One sentence: when you need this guide. */
  summary: string;
  area: HelpArea;
  /** Extra words people might search with ("password", "forgot"). */
  keywords: readonly string[];
  /**
   * `PERMISSION_TABLE` ids; the guide shows when the user holds at least
   * one of them (non-break-glass). Empty = everyone in the role.
   */
  requires: readonly string[];
  steps: readonly string[];
  /** "Good to know" points: consequences, limits, what cannot be undone. */
  notes?: readonly string[];
  /** The screen the guide is about, relative to the role's workspace root. */
  screen?: { label: string; href: string };
  /** Ids of related guides in the same role's set. */
  related?: readonly string[];
}

export interface RoleGuideSet {
  role: Role;
  guides: readonly Guide[];
}
