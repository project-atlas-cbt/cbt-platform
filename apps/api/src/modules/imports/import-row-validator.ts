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
   * sense — this school's existing SchoolMembership.loginIdentifiers. */
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
    if ((ctx.idCountsInFile.get(studentId) ?? 0) > 1) {
      errors.push({
        field: 'Student ID',
        message: `Student ID "${studentId}" appears more than once in this file.`,
      });
    }
    if (ctx.existingStudentIds.has(studentId)) {
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
    if ((ctx.idCountsInFile.get(staffId) ?? 0) > 1) {
      errors.push({
        field: 'Staff ID',
        message: `Staff ID "${staffId}" appears more than once in this file.`,
      });
    }
    if (ctx.existingStaffIds.has(staffId)) {
      errors.push({
        field: 'Staff ID',
        message: `A teacher with staff ID "${staffId}" already exists at this school.`,
      });
    }
  }

  return errors;
}
