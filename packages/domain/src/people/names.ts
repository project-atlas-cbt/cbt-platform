/**
 * Person names (owner decision 2026-10-09). A person has a surname
 * (`lastName`), a first name and an optional middle name. Wherever staff
 * see people in a list, roster, result, print or export, the name reads
 * "Surname First Middle" — the order of a school register — and the list
 * runs A to Z by surname, then first name, then middle name. Greetings and
 * emails keep the natural "First Middle Surname" order.
 */
export interface PersonNameParts {
  firstName: string;
  middleName?: string | null | undefined;
  lastName: string;
}

function joinWords(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
}

/** "Ojo Abiola Bola": surname, first name, middle name. */
export function formalName(name: PersonNameParts): string {
  return joinWords([name.lastName, name.firstName, name.middleName]);
}

/** "Abiola Bola Ojo": the stored `User.displayName`, used to greet a person. */
export function naturalName(name: PersonNameParts): string {
  return joinWords([name.firstName, name.middleName, name.lastName]);
}

/** A blank middle name is stored as null, never as an empty string. */
export function normaliseMiddleName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Ignores capitals and accents ("OJO" = "Ojo" = "Ọjọ"), and orders digits by
 * value, so Student IDs run 1, 2, 9, 10 and "OLA/9" comes before "OLA/10".
 * The database cannot be relied on for either: its collation is byte order.
 */
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return collator.compare(a ?? '', b ?? '');
}

/**
 * A to Z by surname, then first name, then middle name, then the person's
 * identifier (Student ID or Staff ID), so the order is total and a page
 * never repeats or skips anyone with the same name.
 */
export function comparePersonNames(
  a: PersonNameParts & { identifier?: string | null | undefined },
  b: PersonNameParts & { identifier?: string | null | undefined },
): number {
  return (
    compareText(a.lastName, b.lastName) ||
    compareText(a.firstName, b.firstName) ||
    compareText(a.middleName, b.middleName) ||
    compareText(a.identifier, b.identifier)
  );
}

/** Sorts `rows` in place A to Z by the person each row names. */
export function sortByPersonName<T>(
  rows: T[],
  person: (row: T) => PersonNameParts & { identifier?: string | null | undefined },
): T[] {
  return rows.sort((a, b) => comparePersonNames(person(a), person(b)));
}
