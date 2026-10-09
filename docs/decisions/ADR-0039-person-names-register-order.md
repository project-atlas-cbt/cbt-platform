# ADR-0039 — Person names: middle name, register order, A to Z

**Status:** Accepted
**Date:** 2026-10-09
**Deciders:** Haneef (project owner)
**Audit findings:** none
**Affects phases:** B6, B7, B12, B15, B18, F7, F8, F12, F15

## Context

The pilot exam (2026-10-08) showed three problems with names. The investigation is
`/mnt/project-files/student-names/recommendation.md`.

1. **No middle name.** Most Nigerian secondary students have three names. A person had only
   `first_name` and `last_name`, so the third name had to share a box with another name.
2. **The list order was unclear and not alphabetical.** The Name column showed "First Last" but
   sorted by last name alone, with no second key. With no column chosen, lists ran in Student ID
   order. Results and exam control sorted by first name; exports and sign-in slips had no order at
   all. The database's collation is byte order, so capitals came before lower case, and Student IDs
   sorted as text (10 before 2).
3. **The pilot school's names are stored swapped.** Its roster lists names as "Surname First
   Middle", so its upload put the surname under First Name and "First Middle" under Last Name.

Schools work from registers in "Surname First Middle" order and expect students A to Z by surname.

## Decision

1. **An optional middle name** on every person (`users.middle_name`, null when there is none). It is
   on the add and edit forms, the student and teacher import templates (optional column), and the
   student and teacher exports. Search matches it. Passwordless sign-in does not require it.
2. **Register order wherever staff see people listed.** Lists, rosters, results, exam control,
   exports, prints and sign-in slips show **"Surname First Middle"** (`formalName`). Greetings,
   emails and authorship ("created by") keep the natural order in `display_name`
   ("First Middle Surname"). Surnames are shown as typed, not in capitals (owner's choice).
3. **A to Z by default, for students and staff.** Every people list opens sorted by surname, then
   first name, then middle name, then the person's ID, ignoring capitals and accents. Clicking the
   Name heading toggles Z to A; clicking the ID heading sorts by ID. IDs sort by number value
   (1, 2, 10; OLA/9 before OLA/10). Staff lists follow the same rule (owner's choice).
4. **Forms and templates ask for the surname first, labelled "Surname".** The import template's
   name columns are `Surname, First Name, Middle Name`. A file with the earlier `Last Name` column
   still imports, so the template version stays 1.
5. **The pilot data is fixed by a reviewed, reversible operator step**, `ops:fix-name-order`: it
   prints every student with the proposed change (new Surname = current First Name, new First Name
   = first word of current Last Name, new Middle Name = the rest), flags anything that does not fit
   (a middle name already set, a several-word surname, more than two given names, an empty name),
   and applies only the rows the school confirmed, in one transaction, one audit entry per student.
   The audit entry records which students were reordered, never their names; `--revert` rebuilds
   the old values from the current ones, and the audit trail makes a second run a no-op.

## How

The sort runs in the application, not the database: the database cannot sort case-insensitively
or by number value under its byte-order collation without a collation per column, which Prisma
cannot express. A list loads the sort keys (names and ID) of every matching row, sorts them with
`Intl.Collator('en', { sensitivity: 'base', numeric: true })` (`@atlas/domain` `names.ts`), and
loads the requested page in full. A school's people number in the low thousands, so this is cheap.

## Consequences

- One expand-only migration: a nullable column and a new search index that includes it. The old
  search index stays until a later contract release drops it.
- Every existing name keeps its value; nothing moves until the operator step runs.
- Data-subject redaction and `ops:anonymise-copy` clear the middle name too.
