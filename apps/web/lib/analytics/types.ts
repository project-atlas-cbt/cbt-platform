import type { ApiComponents } from '@atlas/contracts';

export type ExamAnalyticsResponseDto = ApiComponents['schemas']['ExamAnalyticsResponseDto'];
export type QuestionAnalyticsResponseDto = ApiComponents['schemas']['QuestionAnalyticsResponseDto'];
export type QuestionPerformanceDto = ApiComponents['schemas']['QuestionPerformanceDto'];
export type ClassAnalyticsResponseDto = ApiComponents['schemas']['ClassAnalyticsResponseDto'];
export type DepartmentAnalyticsResponseDto =
  ApiComponents['schemas']['DepartmentAnalyticsResponseDto'];
export type SchoolAnalyticsResponseDto = ApiComponents['schemas']['SchoolAnalyticsResponseDto'];
export type StudentAnalyticsResponseDto = ApiComponents['schemas']['StudentAnalyticsResponseDto'];
export type PlatformAnalyticsResponseDto = ApiComponents['schemas']['PlatformAnalyticsResponseDto'];
export type PlatformAnalyticsTrendDto = ApiComponents['schemas']['PlatformAnalyticsTrendDto'];

export interface PercentageMetricDto {
  averagePercentage?: number | Record<string, never> | null;
  highestPercentage?: number | Record<string, never> | null;
  lowestPercentage?: number | Record<string, never> | null;
  passRate?: number | Record<string, never> | null;
  resultCount?: number;
}

export type ParticipationMetricDto = ApiComponents['schemas']['ParticipationMetricDto'];
export type PercentageDistributionBucketDto =
  ApiComponents['schemas']['PercentageDistributionBucketDto'];
export type ComparisonMetricDto = ApiComponents['schemas']['ComparisonMetricDto'];
export type AnalyticsTrendDto = ApiComponents['schemas']['AnalyticsTrendDto'];

export type QuestionCountsResponseDto = ApiComponents['schemas']['QuestionCountsResponseDto'];
export type SchoolSubscriptionStatusResponseDto =
  ApiComponents['schemas']['SchoolSubscriptionStatusResponseDto'];
export type MyTeacherAssignmentsResponseDto =
  ApiComponents['schemas']['MyTeacherAssignmentsResponseDto'];
export type MyTeacherAssignmentEntryDto = ApiComponents['schemas']['MyTeacherAssignmentEntryDto'];

export type MetricNumber = number | Record<string, never> | null | undefined;

/** Formats a numeric percentage (0-100) or null to a clean label e.g. "68.7%" or "—". */
export function formatPercentage(value: MetricNumber, digits: number = 1): string {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return '—';
  }
  return `${Number(value.toFixed(digits))}%`;
}

/** Formats a 0..1 rate into a whole percentage or 1-decimal percentage string. */
export function formatRatePercentage(rate: MetricNumber, digits: number = 1): string {
  if (rate === null || rate === undefined || typeof rate !== 'number' || isNaN(rate)) {
    return '—';
  }
  return `${Number((rate * 100).toFixed(digits))}%`;
}

/** Formats integer counts with commas (e.g. 1,240). */
export function formatCount(value: MetricNumber): string {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return '0';
  }
  return value.toLocaleString('en-US');
}
