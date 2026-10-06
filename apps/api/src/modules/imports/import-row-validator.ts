export interface FieldError {
  field: string;
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Both validators take a batched-lookup context (built once per file by
 * ImportValidationService, never per row) — `05 §10.2`'s duplicate/invalid-
 * reference checks need to compare against the whole file and the whole
 * school's existing records, which one query up front makes cheap; a
 * per-row query would be the exact N+1 shape this codebase's `list()`
 * endpoints already document avoiding (StudentService.list, F7). */
export interface StudentValidationContext {
  /** Student IDs already present in `05 §10.2`'s "duplicate accounts"
   * sense — this school's existing SchoolMembership.loginIdentifiers,
   * lower-cased, as `idCountsInFile`'s keys are: sign-in ignores case. */
  existingStudentIds: Set<string>;
  /** How many times each Student ID appears in *this file* — every row
   * sharing an ID that appears more than once is flagged, not just the
   * second-and-later occurrence, since there is no principled way to pick
   * which one "wins" (05 §10.2: "never partially import silently"). */
  idCountsInFile: Map<string, number>;
  /** Keyed by lower-cased class name — `ClassGroup.name` is the school's
   * own freeform label, matched case-insensitively, scoped to the job's
   * target academic session. */
  classesByName: Map<string, { id: string; departmentId: string | null }>;
  /** Keyed by lower-cased department name. */
  departmentsByName: Map<string, { id: string }>;
}

/**
 * `03 §16`'s validation catalogue, resolved: required fields, duplicate ID
 * (in-file and against existing records), invalid class, invalid
 * department. An engineering judgment call, not specified in the docs: a
 * *blank* Department cell is always accepted, even for a class that does
 * carry one — `ClassGroup.departmentId` is already the authoritative
 * source (Department is supplementary, cross-checked only when given), so
 * requiring every row to redundantly restate it would frustrate a
 * legitimate import for no correctness gain. A *non-blank* Department that
 * doesn't resolve, or resolves but disagrees with the row's own Class, is
 * still a real error.
 */
export function validateStudentRow(
  row: Record<string, string>,
  ctx: StudentValidationContext,
): FieldError[] {
  const errors: FieldError[] = [];
  const studentId = row['Student ID'] ?? '';
  const firstName = row['First Name'] ?? '';
  const lastName = row['Last Name'] ?? '';
  const className = row['Class'] ?? '';
  const departmentName = row['Department'] ?? '';

  if (!studentId) errors.push({ field: 'Student ID', message: 'Student ID is required.' });
  if (!firstName) errors.push({ field: 'First Name', message: 'First Name is required.' });
  if (!lastName) errors.push({ field: 'Last Name', message: 'Last Name is required.' });
  if (!className) errors.push({ field: 'Class', message: 'Class is required.' });

  if (studentId) {
    if ((ctx.idCountsInFile.get(studentId.toLowerCase()) ?? 0) > 1) {
      errors.push({
        field: 'Student ID',
        message: `Student ID "${studentId}" appears more than once in this file.`,
      });
    }
    if (ctx.existingStudentIds.has(studentId.toLowerCase())) {
      errors.push({
        field: 'Student ID',
        message: `A student with ID "${studentId}" already exists at this school.`,
      });
    }
  }

  let resolvedClass: { id: string; departmentId: string | null } | undefined;
  if (className) {
    resolvedClass = ctx.classesByName.get(className.toLowerCase());
    if (!resolvedClass) {
      errors.push({
        field: 'Class',
        message: `Class "${className}" was not found in the target academic session.`,
      });
    }
  }

  if (departmentName) {
    const resolvedDepartment = ctx.departmentsByName.get(departmentName.toLowerCase());
    if (!resolvedDepartment) {
      errors.push({
        field: 'Department',
        message: `Department "${departmentName}" was not found.`,
      });
    } else if (resolvedClass && resolvedClass.departmentId !== resolvedDepartment.id) {
      errors.push({
        field: 'Department',
        message: `Department "${departmentName}" does not match class "${className}".`,
      });
    }
  }

  return errors;
}

export interface TeacherValidationContext {
  existingStaffIds: Set<string>;
  idCountsInFile: Map<string, number>;
}

/** `Email` is required (not merely well-formed when given) — the commit
 * job's `IdentityService.issueStaffInvitation` throws without one, so a
 * missing address must be caught here, at validation, not surfaced as a
 * confusing row-level FAILED at commit time. */
export function validateTeacherRow(
  row: Record<string, string>,
  ctx: TeacherValidationContext,
): FieldError[] {
  const errors: FieldError[] = [];
  const staffId = row['Staff ID'] ?? '';
  const firstName = row['First Name'] ?? '';
  const lastName = row['Last Name'] ?? '';
  const email = row['Email'] ?? '';

  if (!staffId) errors.push({ field: 'Staff ID', message: 'Staff ID is required.' });
  if (!firstName) errors.push({ field: 'First Name', message: 'First Name is required.' });
  if (!lastName) errors.push({ field: 'Last Name', message: 'Last Name is required.' });
  if (!email) {
    errors.push({ field: 'Email', message: 'Email is required.' });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'Email', message: `"${email}" is not a valid email address.` });
  }

  if (staffId) {
    if ((ctx.idCountsInFile.get(staffId.toLowerCase()) ?? 0) > 1) {
      errors.push({
        field: 'Staff ID',
        message: `Staff ID "${staffId}" appears more than once in this file.`,
      });
    }
    if (ctx.existingStaffIds.has(staffId.toLowerCase())) {
      errors.push({
        field: 'Staff ID',
        message: `A teacher with staff ID "${staffId}" already exists at this school.`,
      });
    }
  }

  return errors;
}

const OPTION_COLUMNS = ['Option A', 'Option B', 'Option C', 'Option D'] as const;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** B8 — a question row has no natural duplicate-detection identifier the
 * way Student ID/Staff ID do (05 §18's template carries none), so there is
 * no `idCountsInFile`-shaped context here; every row is validated
 * independently against the school's real academic structure. */
export interface QuestionValidationContext {
  /** Keyed by lower-cased subject name (Subject is not session-scoped —
   * unlike STUDENTS' class lookup, no target-session filter applies). */
  subjectsByName: Map<string, { id: string; departmentId: string | null }>;
  /** Keyed by lower-cased class name, resolved school-wide (not scoped to
   * one session — a question's `level` outlives any one session, unlike a
   * StudentEnrollment). */
  classLevelsByName: Map<string, string>;
  /** The uploader's own active TeacherAssignment (subjectId, level) pairs
   * — ADR-0001 §2's scope join, resolved once per file rather than once
   * per row (batched, matching this file's own established convention). */
  assignedPairs: Set<string>;
}

function assignedPairKey(subjectId: string, level: string): string {
  return `${subjectId}::${level}`;
}
export { assignedPairKey as questionAssignedPairKey };

/**
 * 05 §15.4's validation catalogue, resolved for the CSV shape: required
 * fields, at least two non-blank options, exactly one correct-answer
 * letter matching a non-blank option, valid marks, and the same ADR-0001
 * subject+level scope check `question-validation.util.ts` enforces for
 * interactive submission — extended here to the *uploader's* own
 * assignments, since every imported question is authored as that person
 * (see `QuestionService.createFromImportRow`'s own doc comment).
 */
export function validateQuestionRow(
  row: Record<string, string>,
  ctx: QuestionValidationContext,
): FieldError[] {
  const errors: FieldError[] = [];
  const content = row['Question'] ?? '';
  const subjectName = row['Subject'] ?? '';
  const className = row['Class'] ?? '';
  const correctAnswer = (row['Correct Answer'] ?? '').trim().toUpperCase();
  const difficulty = (row['Difficulty'] ?? '').trim().toUpperCase();
  const marksRaw = row['Marks'] ?? '';

  if (!content.trim()) errors.push({ field: 'Question', message: 'Question text is required.' });

  const options = OPTION_COLUMNS.map((col) => (row[col] ?? '').trim());
  const nonBlankCount = options.filter((value) => value.length > 0).length;
  if (nonBlankCount < 2) {
    errors.push({ field: 'Option A', message: 'At least two options are required.' });
  }

  if (!correctAnswer) {
    errors.push({ field: 'Correct Answer', message: 'Correct Answer is required.' });
  } else if (!(OPTION_LETTERS as readonly string[]).includes(correctAnswer)) {
    errors.push({
      field: 'Correct Answer',
      message: `Correct Answer must be one of ${OPTION_LETTERS.join(', ')}.`,
    });
  } else {
    const index = OPTION_LETTERS.indexOf(correctAnswer as (typeof OPTION_LETTERS)[number]);
    if (!options[index]) {
      errors.push({
        field: 'Correct Answer',
        message: `Correct Answer "${correctAnswer}" refers to an empty option.`,
      });
    }
  }

  if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
    errors.push({
      field: 'Difficulty',
      message: 'Difficulty must be one of EASY, MEDIUM, HARD.',
    });
  }

  const marks = Number(marksRaw);
  if (!marksRaw || !Number.isInteger(marks) || marks < 1 || marks > 100) {
    errors.push({ field: 'Marks', message: 'Marks must be a whole number between 1 and 100.' });
  }

  let resolvedSubject: { id: string; departmentId: string | null } | undefined;
  if (!subjectName) {
    errors.push({ field: 'Subject', message: 'Subject is required.' });
  } else {
    resolvedSubject = ctx.subjectsByName.get(subjectName.toLowerCase());
    if (!resolvedSubject) {
      errors.push({ field: 'Subject', message: `Subject "${subjectName}" was not found.` });
    }
  }

  let resolvedLevel: string | undefined;
  if (!className) {
    errors.push({ field: 'Class', message: 'Class is required.' });
  } else {
    resolvedLevel = ctx.classLevelsByName.get(className.toLowerCase());
    if (!resolvedLevel) {
      errors.push({ field: 'Class', message: `Class "${className}" was not found.` });
    }
  }

  if (resolvedSubject && resolvedLevel) {
    if (!ctx.assignedPairs.has(assignedPairKey(resolvedSubject.id, resolvedLevel))) {
      errors.push({
        field: 'Subject',
        message:
          'You have no active assignment covering this subject and level — questions may only be ' +
          'imported within your assigned scope.',
      });
    }
  }

  return errors;
}
