/** Cross-process contract for B18's private, school-scoped CSV exports. */
export const EXPORT_QUEUE_NAME = 'atlas-report-export';
export const EXPORT_EXPIRY_QUEUE_NAME = 'atlas-report-export-expiry';

export interface ExportJobPayload {
  schoolId: string;
  exportJobId: string;
}

export const EXPORT_ARTEFACT_TTL_MS = 24 * 60 * 60 * 1000;
