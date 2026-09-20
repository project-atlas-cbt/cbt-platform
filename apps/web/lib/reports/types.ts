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

export interface PrintSummaryStats {
  totalParticipants?: number;
  presentCount?: number;
  absentCount?: number;
  averageScore?: number;
  averagePercentage?: number;
  passCount?: number;
  failCount?: number;
  passRate?: number;
  highestPercentage?: number;
  lowestPercentage?: number;
}

export interface PrintExamResultsData {
  exam: {
    id: string;
    title: string;
    description?: string | null;
    durationMinutes: number;
    totalMarks: number;
    subject: { id: string; name: string; code: string };
  };
  results: Array<{
    id: string;
    studentId: string;
    studentName: string;
    className?: string;
    earnedMarks: number;
    totalMarks: number;
    percentage: number;
    grade?: string | null;
    state: string;
    submittedAt?: string | null;
  }>;
  summary?: PrintSummaryStats;
}

export interface PrintQuestionAnalysisItem {
  questionId: string;
  sequenceNumber: number;
  textSnippet: string;
  topicName?: string | null;
  difficulty?: string;
  marks: number;
  totalAnswers?: number;
  correctAnswers?: number;
  successRate?: number;
}

export interface PrintExamPerformanceData {
  summary: Record<string, unknown>;
  questions: PrintQuestionAnalysisItem[];
}
