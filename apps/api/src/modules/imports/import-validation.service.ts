import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { ImportParseError, parseImportFile } from './import-file-parser.js';
import { IMPORT_TEMPLATES, IMPORT_TEMPLATE_VERSION } from './import-templates.js';
import {
  validateStudentRow,
  validateTeacherRow,
  validateQuestionRow,
  questionAssignedPairKey,
  type FieldError,
  type StudentValidationContext,
  type TeacherValidationContext,
  type QuestionValidationContext,
} from './import-row-validator.js';
import { classifyUnavailable } from '../../common/dependency-errors.js';

/** A-17's own recommended number, adopted as the engineering default —
 * generous headroom above the DoD's 1,500-row fixture. */
export const MAX_IMPORT_ROWS = 5000;

export const EXCEL_DATE_MESSAGE =
  'Excel changed this value into a date. Format the column as Text in Excel, type the value ' +
  'again, and upload the file again.';

const ID_COLUMN: Record<'STUDENTS' | 'TEACHERS', string> = {
  STUDENTS: 'Student ID',
  TEACHERS: 'Staff ID',
};

/** QUESTIONS rows have no natural duplicate-detection identifier (05 §18's
 * template carries none — see `QuestionValidationContext`'s own doc
 * comment) — this type guard keeps the STUDENTS/TEACHERS-only
 * id-in-file/existing-id computation from running for that type at all. */
function isPersonImportType(
  type: 'STUDENTS' | 'TEACHERS' | 'QUESTIONS',
): type is 'STUDENTS' | 'TEACHERS' {
  return type === 'STUDENTS' || type === 'TEACHERS';
}

function countOccurrences(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * The validation half of B7's pipeline (`Upload → Parse → Validate →
 * Preview → Confirm → Import → Summary`, `05 §10.1`) — parses the uploaded
 * file, resolves every row's references against real school data via
 * batched (never per-row) lookups, and writes one ImportRow per data row.
 * A whole-file rejection (bad template version, unparsable file, missing
 * required columns, row-count cap) never creates any ImportRow — only a
 * `FAILED` ImportJob with a `failureReason`, exactly like `MediaAsset
 * .rejectionReason`'s own convention.
 *
 * Deliberately a plain injectable Nest service, run from a BullMQ `Worker`
 * constructed *inside apps/api itself* (`ImportQueueService`), not
 * `apps/worker` — see that class's own doc comment for the full reasoning
 * (this service needs no Nest DI reuse concern of its own; the constraint
 * lives one layer up, in what actually invokes it).
 */
@Injectable()
export class ImportValidationService {
  private readonly logger = new Logger(ImportValidationService.name);

  constructor(private readonly storage: ObjectStorageService) {}

  /**
   * `finalAttempt` (B22): whether BullMQ has no retry left after this run.
   * A storage or database outage is rethrown for BullMQ to retry while
   * attempts remain — it says nothing about the file — and only fails the
   * import on the last one.
   */
  async validate(
    schoolId: string,
    importJobId: string,
    opts: { finalAttempt?: boolean } = {},
  ): Promise<void> {
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.findUnique({ where: { id: importJobId } }),
    );
    if (!job || job.schoolId !== schoolId) {
      this.logger.warn(`validate(): ImportJob ${importJobId} not found for school ${schoolId}.`);
      return;
    }
    // Idempotent no-op re-entry — BullMQ's own jobId dedup already prevents
    // a concurrent double-run, but a stray manual re-trigger against an
    // already-resolved job should never re-validate.
    if (job.status !== 'PENDING_VALIDATION' && job.status !== 'VALIDATING') return;

    await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.update({ where: { id: importJobId }, data: { status: 'VALIDATING' } }),
    );

    try {
      const asset = await withTenant(prisma, schoolId, (tx) =>
        tx.mediaAsset.findUnique({ where: { id: job.sourceMediaAssetId } }),
      );
      if (!asset || !asset.sniffedMimeType) {
        await this.fail(schoolId, importJobId, 'The uploaded file could not be read.');
        return;
      }

      const buffer = await this.storage.getObject(asset.storageKey);
      const parsed = await parseImportFile(buffer, asset.sniffedMimeType);

      if (parsed.version === null) {
        await this.fail(
          schoolId,
          importJobId,
          'This file is missing the template version marker. Please download the current ' +
            'template and re-enter your data into it.',
        );
        return;
      }
      if (parsed.version !== IMPORT_TEMPLATE_VERSION) {
        await this.fail(
          schoolId,
          importJobId,
          `This file was prepared against template version ${parsed.version}, but the current ` +
            `version is ${IMPORT_TEMPLATE_VERSION}. Please download the current template.`,
        );
        return;
      }
      // Captured as a plain number, not `parsed.version` — a property
      // access's narrowing doesn't reliably survive being read from inside
      // a nested `withTenant(...)` closure below.
      const templateVersion = parsed.version;

      const def = IMPORT_TEMPLATES[job.type];
      const missingColumns = def.columns.filter((column) => !parsed.headers.includes(column));
      if (missingColumns.length > 0) {
        await this.fail(
          schoolId,
          importJobId,
          `This file is missing required column(s): ${missingColumns.join(', ')}.`,
        );
        return;
      }

      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        await this.fail(
          schoolId,
          importJobId,
          `This file has ${parsed.rows.length} rows, exceeding the ${MAX_IMPORT_ROWS}-row limit ` +
            'per import.',
        );
        return;
      }

      const idColumn = isPersonImportType(job.type) ? ID_COLUMN[job.type] : null;
      const idsInFile = idColumn ? parsed.rows.map((row) => row[idColumn] ?? '') : [];
      const idCountsInFile = countOccurrences(idsInFile);

      // One transaction for the whole read-then-write sequence, not two
      // separate withTenant() calls: the original split left a real window
      // where a crash between "outcomes computed" and "rows written +
      // job marked VALIDATED" would strand the job in VALIDATING forever,
      // with nothing to detect or recover it. Nothing between the reads and
      // the writes below does any I/O of its own (pure in-memory row
      // validation), so merging them costs nothing and closes that window
      // outright — either the whole validation run lands, or none of it
      // does.
      await withTenant(prisma, schoolId, async (tx) => {
        const existingMemberships = idColumn
          ? await tx.schoolMembership.findMany({
              where: { schoolId, loginIdentifier: { in: idsInFile.filter(Boolean) } },
              select: { loginIdentifier: true },
            })
          : [];
        const existingIds = new Set(existingMemberships.map((m) => m.loginIdentifier));

        let outcomes: {
          rowNumber: number;
          rawData: Record<string, string>;
          errors: FieldError[];
        }[];
        if (job.type === 'QUESTIONS') {
          // B8 — every imported question is authored as the uploader
          // (QuestionService.createFromImportRow's own doc comment), so
          // scope is resolved against *their* active TeacherAssignments,
          // the same ADR-0001 join interactive creation uses.
          const uploaderMembership = await tx.schoolMembership.findFirst({
            where: { schoolId, userId: job.uploaderUserId },
            select: { id: true },
          });
          const teacherProfile = uploaderMembership
            ? await tx.teacherProfile.findUnique({
                where: { schoolId_membershipId: { schoolId, membershipId: uploaderMembership.id } },
                select: { id: true },
              })
            : null;
          const assignments = teacherProfile
            ? await tx.teacherAssignment.findMany({
                where: { schoolId, teacherProfileId: teacherProfile.id, status: 'ACTIVE' },
                select: {
                  classSubject: {
                    select: { subjectId: true, classGroupSession: { select: { level: true } } },
                  },
                },
              })
            : [];
          const assignedPairs = new Set(
            assignments.map((a) =>
              questionAssignedPairKey(
                a.classSubject.subjectId,
                a.classSubject.classGroupSession.level,
              ),
            ),
          );

          const [subjects, classes] = await Promise.all([
            tx.subject.findMany({
              where: { schoolId, status: 'ACTIVE' },
              select: { id: true, name: true, departmentId: true },
            }),
            // Deliberately school-wide, not session-scoped: a Question's
            // `level` outlives any one session, and a class name's level
            // is structurally consistent across the sessions it recurs in
            // (e.g. "SS2A" is always level SS2), so the last session's row
            // to populate this name in the map is equally correct.
            tx.classGroup.findMany({
              where: { schoolId, status: 'ACTIVE' },
              select: { name: true, level: true },
            }),
          ]);
          const ctx: QuestionValidationContext = {
            subjectsByName: new Map(
              subjects.map((s) => [
                s.name.toLowerCase(),
                { id: s.id, departmentId: s.departmentId },
              ]),
            ),
            classLevelsByName: new Map(classes.map((c) => [c.name.toLowerCase(), c.level])),
            assignedPairs,
          };
          outcomes = parsed.rows.map((row, i) => ({
            rowNumber: i + 1,
            rawData: row,
            errors: validateQuestionRow(row, ctx),
          }));
        } else if (job.type === 'STUDENTS') {
          // createStudentImport always resolves a real session before
          // creating a STUDENTS-type job (or throws) — null here would be a
          // real bug elsewhere, so this is asserted, not silently coerced.
          if (!job.targetAcademicSessionId) {
            throw new Error('This import job has no target academic session.');
          }
          const [classes, departments] = await Promise.all([
            tx.classGroup.findMany({
              where: { schoolId, academicSessionId: job.targetAcademicSessionId, status: 'ACTIVE' },
              select: { id: true, name: true, departmentId: true },
            }),
            tx.department.findMany({
              where: { schoolId, status: 'ACTIVE' },
              select: { id: true, name: true },
            }),
          ]);
          const ctx: StudentValidationContext = {
            existingStudentIds: existingIds,
            idCountsInFile,
            classesByName: new Map(
              classes.map((c) => [
                c.name.toLowerCase(),
                { id: c.id, departmentId: c.departmentId },
              ]),
            ),
            departmentsByName: new Map(
              departments.map((d) => [d.name.toLowerCase(), { id: d.id }]),
            ),
          };
          outcomes = parsed.rows.map((row, i) => ({
            rowNumber: i + 1,
            rawData: row,
            errors: validateStudentRow(row, ctx),
          }));
        } else {
          const ctx: TeacherValidationContext = { existingStaffIds: existingIds, idCountsInFile };
          outcomes = parsed.rows.map((row, i) => ({
            rowNumber: i + 1,
            rawData: row,
            errors: validateTeacherRow(row, ctx),
          }));
        }

        // P1-11: a date in any column is Excel's conversion of what was
        // typed, never the value the school meant; report it on the row.
        outcomes = outcomes.map((o, i) => {
          const dateColumns = parsed.dateColumnsByRow[i] ?? [];
          if (dateColumns.length === 0) return o;
          return {
            ...o,
            errors: [
              ...o.errors,
              ...dateColumns.map((field) => ({ field, message: EXCEL_DATE_MESSAGE })),
            ],
          };
        });

        const validRows = outcomes.filter((o) => o.errors.length === 0).length;
        const invalidRows = outcomes.length - validRows;

        if (outcomes.length > 0) {
          await tx.importRow.createMany({
            data: outcomes.map((o) => ({
              schoolId,
              importJobId,
              rowNumber: o.rowNumber,
              rawData: o.rawData,
              status: o.errors.length === 0 ? ('VALID' as const) : ('INVALID' as const),
              // exactOptionalPropertyTypes: omit the key entirely when
              // there are no errors, rather than assigning `undefined`
              // (which Prisma's Json input type doesn't accept — it wants
              // either a real value or the key absent).
              ...(o.errors.length > 0 && {
                errors: o.errors as unknown as Prisma.InputJsonValue,
              }),
            })),
          });
        }
        await tx.importJob.update({
          where: { id: importJobId },
          data: {
            status: 'VALIDATED',
            templateVersion,
            totalRows: outcomes.length,
            validRows,
            invalidRows,
          },
        });
      });
    } catch (error) {
      if (error instanceof ImportParseError) {
        await this.fail(schoolId, importJobId, error.message);
        return;
      }
      if (classifyUnavailable(error) !== undefined && !opts.finalAttempt) {
        this.logger.warn({
          msg: 'validate(): dependency unavailable; BullMQ will retry',
          importJobId,
        });
        throw error;
      }
      if (classifyUnavailable(error) !== undefined) {
        await this.fail(
          schoolId,
          importJobId,
          'The file could not be read because a service was temporarily unavailable. ' +
            'Please upload it again.',
        );
        return;
      }
      // An unexpected (non-parse) failure — surface it the same way rather
      // than leaving the job stuck in VALIDATING forever, but log loudly
      // since this is not an expected/user-facing failure mode.
      this.logger.error(`validate(): unexpected failure for ImportJob ${importJobId}`, error);
      await this.fail(
        schoolId,
        importJobId,
        'An unexpected error occurred while validating this file.',
      );
    }
  }

  private async fail(schoolId: string, importJobId: string, reason: string): Promise<void> {
    await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.update({
        where: { id: importJobId },
        data: { status: 'FAILED', failureReason: reason },
      }),
    );
  }
}
