/**
 * ADR-0038 amendment (2026-10-09) — the standard setup: a starting academic
 * structure for a Nigerian secondary school, which the school then edits.
 *
 * It follows how schools run (a vice-principal's account, relayed by
 * Haneef): three departments, Science, Business and Humanities; a subject
 * every stream takes still sits in one department so its HOD reviews it
 * (Mathematics in Science, English in Humanities); and the same three names
 * as student streams. A subject's department never decides who takes it;
 * class offerings do.
 *
 * Applying it only adds what the school lacks and places existing subjects
 * that have no department. It never moves or renames anything.
 */

export type StandardSetupStage = 'JSS' | 'SS' | 'JSS_AND_SS';

export interface StandardDepartment {
  code: string;
  name: string;
}

export interface StandardStream {
  code: string;
  name: string;
}

export interface StandardChoiceGroup {
  key: string;
  name: string;
  minChoices: number;
  maxChoices: number;
}

export interface StandardSubject {
  code: string;
  name: string;
  departmentCode: string;
  /** A display hint only: subjects are school-wide, offerings are per class. */
  stage: StandardSetupStage;
  choiceGroupKey?: string;
}

export const STANDARD_DEPARTMENTS: readonly StandardDepartment[] = [
  { code: 'SCI', name: 'Science' },
  { code: 'BUS', name: 'Business' },
  { code: 'HUM', name: 'Humanities' },
];

export const STANDARD_STREAMS: readonly StandardStream[] = [
  { code: 'SCI', name: 'Science' },
  { code: 'BUS', name: 'Business' },
  { code: 'HUM', name: 'Humanities' },
];

export const STANDARD_CHOICE_GROUPS: readonly StandardChoiceGroup[] = [
  { key: 'RELIGION', name: 'Religion', minChoices: 1, maxChoices: 1 },
  { key: 'TRADE', name: 'Trade subject', minChoices: 1, maxChoices: 1 },
];

export const STANDARD_SUBJECTS: readonly StandardSubject[] = [
  // Science
  { code: 'MTH', name: 'Mathematics', departmentCode: 'SCI', stage: 'JSS_AND_SS' },
  { code: 'BSC', name: 'Basic Science', departmentCode: 'SCI', stage: 'JSS' },
  { code: 'BTE', name: 'Basic Technology', departmentCode: 'SCI', stage: 'JSS' },
  { code: 'DTE', name: 'Digital Technologies', departmentCode: 'SCI', stage: 'JSS_AND_SS' },
  { code: 'PHE', name: 'Physical and Health Education', departmentCode: 'SCI', stage: 'JSS' },
  { code: 'AGR', name: 'Agricultural Science', departmentCode: 'SCI', stage: 'JSS_AND_SS' },
  { code: 'PHY', name: 'Physics', departmentCode: 'SCI', stage: 'SS' },
  { code: 'CHM', name: 'Chemistry', departmentCode: 'SCI', stage: 'SS' },
  { code: 'BIO', name: 'Biology', departmentCode: 'SCI', stage: 'SS' },
  { code: 'FMT', name: 'Further Mathematics', departmentCode: 'SCI', stage: 'SS' },
  { code: 'TDR', name: 'Technical Drawing', departmentCode: 'SCI', stage: 'SS' },
  {
    code: 'ANH',
    name: 'Animal Husbandry',
    departmentCode: 'SCI',
    stage: 'SS',
    choiceGroupKey: 'TRADE',
  },
  // Humanities
  { code: 'ENG', name: 'English Language', departmentCode: 'HUM', stage: 'JSS_AND_SS' },
  { code: 'CIV', name: 'Civic Education', departmentCode: 'HUM', stage: 'JSS_AND_SS' },
  { code: 'SST', name: 'Social Studies', departmentCode: 'HUM', stage: 'JSS' },
  { code: 'CCA', name: 'Cultural and Creative Arts', departmentCode: 'HUM', stage: 'JSS' },
  { code: 'FRE', name: 'French', departmentCode: 'HUM', stage: 'JSS' },
  {
    code: 'CRS',
    name: 'Christian Religious Studies',
    departmentCode: 'HUM',
    stage: 'JSS_AND_SS',
    choiceGroupKey: 'RELIGION',
  },
  {
    code: 'IRS',
    name: 'Islamic Religious Studies',
    departmentCode: 'HUM',
    stage: 'JSS_AND_SS',
    choiceGroupKey: 'RELIGION',
  },
  { code: 'LIT', name: 'Literature in English', departmentCode: 'HUM', stage: 'SS' },
  { code: 'GOV', name: 'Government', departmentCode: 'HUM', stage: 'SS' },
  { code: 'HIS', name: 'History', departmentCode: 'HUM', stage: 'JSS_AND_SS' },
  { code: 'GEO', name: 'Geography', departmentCode: 'HUM', stage: 'SS' },
  // Business
  { code: 'BST', name: 'Business Studies', departmentCode: 'BUS', stage: 'JSS' },
  { code: 'ECO', name: 'Economics', departmentCode: 'BUS', stage: 'SS' },
  { code: 'COM', name: 'Commerce', departmentCode: 'BUS', stage: 'SS' },
  { code: 'ACC', name: 'Financial Accounting', departmentCode: 'BUS', stage: 'SS' },
  {
    code: 'DPR',
    name: 'Data Processing',
    departmentCode: 'BUS',
    stage: 'SS',
    choiceGroupKey: 'TRADE',
  },
  { code: 'MKT', name: 'Marketing', departmentCode: 'BUS', stage: 'SS', choiceGroupKey: 'TRADE' },
];
