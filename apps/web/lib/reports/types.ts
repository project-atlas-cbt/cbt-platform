import type { ApiComponents } from '@atlas/contracts';

export const EXPORT_TYPES = [
  'EXAM_RESULTS',
  'STUDENTS',
  'TEACHERS',
  'CLASSES',
  'QUESTION_BANK',
  'PARTICIPATION',
] as const;

export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export interface ExportScope {
  examId?: string;
  classId?: string;
  subjectId?: string;
  departmentId?: string;
  level?: string;
}

export interface CreateExportInput {
  type: ExportType;
  scope?: ExportScope;
}

export interface ExportJob {
  id: string;
  status: ExportStatus;
  type: ExportType;
  expiresAt: string;
  rowCount: number;
  downloadUrl?: string;
  failureReason?: string;
}

export const SEARCH_CORPORA = [
  'students',
  'teachers',
  'hods',
  'classes',
  'exams',
  'questions',
  'results',
] as const;

export type SearchCorpus = (typeof SEARCH_CORPORA)[number];

export interface SearchItem {
  id: string;
  label: string;
  detail?: string;
}

export interface SearchResponse {
  students: SearchItem[];
  teachers: SearchItem[];
  hods: SearchItem[];
  classes: SearchItem[];
  exams: SearchItem[];
  questions: SearchItem[];
  results: SearchItem[];
}

export interface PlatformSearchResponse {
  schools: SearchItem[];
}

/**
 * F18 print datasets (ADR-0030). Aliased to the generated OpenAPI schemas of
 * `GET /v1/reports/...` (print-data.controller.ts) rather than hand-written,
 * so a view reading a field the API never returns fails typecheck instead of
 * silently printing blanks — the defect the hand-written shapes here hid.
 */
type Schemas = ApiComponents['schemas'];

/** `ResultQueryService.listForExam` — result rows only; absence lives in
 * participation (ADR-0010) and reaches the print only as `summary.absentCount`. */
export type PrintExamResultsData = Schemas['ExamResultsResponseDto'];
export type PrintExamResultItem = Schemas['ResultListItemDto'];

export interface PrintExamPerformanceData {
  summary: Schemas['ExamAnalyticsResponseDto'];
  questions: Schemas['QuestionAnalyticsResponseDto'];
}

export type PrintClassPerformanceData = Schemas['ClassAnalyticsResponseDto'];
export type PrintStudentPerformanceData = Schemas['StudentAnalyticsResponseDto'];
