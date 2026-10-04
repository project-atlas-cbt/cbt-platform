import type { ObjectStorageService } from '../../storage/object-storage.service.js';

/**
 * B22 (project-owner decision 2b, 2026-10-04): the redaction register.
 *
 * A database restore (PITR, or a snapshot) rolls back every redaction made
 * after the restore point — the person's name and identifiers come back.
 * The register is how they are taken out again: one entry per applied
 * redaction, kept OUTSIDE the database (in object storage, which a
 * database restore does not touch), and `ops:redact-subject --replay
 * --since <restore point>` re-applies each entry. The DR runbook makes the
 * replay part of every restore.
 *
 * An entry names the subject by internal UUID only. It never holds the
 * values that were removed, the person's name, or the operator's free-text
 * reason — only the request reference, whose format is fixed so it cannot
 * carry a name either.
 */
export const REDACTION_REGISTER_PREFIX = 'ops/redaction-register/';

/** `DSR-2026-014`: a data-subject request number, nothing else. */
export const REQUEST_REF_PATTERN = /^DSR-\d{4}-\d{3,}$/;

export interface RedactionRegisterEntry {
  version: 1;
  requestRef: string;
  schoolId: string;
  membershipId: string;
  userId: string;
  actorUserId: string;
  appliedAt: string;
}

export type RegisterStorage = Pick<ObjectStorageService, 'putObject' | 'getObject' | 'listKeys'>;

export function assertRequestRef(requestRef: string): void {
  if (!REQUEST_REF_PATTERN.test(requestRef)) {
    throw new Error('The request reference must look like DSR-2026-014 (no names or other text).');
  }
}

/** The key sorts by time, so a `--since` listing is a prefix scan in order. */
function entryKey(entry: RedactionRegisterEntry): string {
  const stamp = entry.appliedAt.replace(/[:.]/g, '-');
  return `${REDACTION_REGISTER_PREFIX}${stamp}_${entry.requestRef}_${entry.membershipId}.json`;
}

export async function writeRegisterEntry(
  storage: RegisterStorage,
  entry: RedactionRegisterEntry,
): Promise<string> {
  const key = entryKey(entry);
  const body = Buffer.from(JSON.stringify(entry));
  await storage.putObject({
    storageKey: key,
    contentType: 'application/json',
    body,
    contentLength: body.length,
  });
  return key;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseEntry(raw: Buffer): RedactionRegisterEntry {
  const e = JSON.parse(raw.toString('utf8')) as Partial<RedactionRegisterEntry>;
  const ok =
    e.version === 1 &&
    typeof e.requestRef === 'string' &&
    REQUEST_REF_PATTERN.test(e.requestRef) &&
    [e.schoolId, e.membershipId, e.userId, e.actorUserId].every(
      (v) => typeof v === 'string' && UUID.test(v),
    ) &&
    typeof e.appliedAt === 'string' &&
    !Number.isNaN(Date.parse(e.appliedAt));
  if (!ok) throw new Error('Malformed redaction register entry.');
  return e as RedactionRegisterEntry;
}

/** Entries applied at or after `since`, oldest first. */
export async function readRegisterSince(
  storage: RegisterStorage,
  since: Date,
): Promise<RedactionRegisterEntry[]> {
  const keys = (await storage.listKeys(REDACTION_REGISTER_PREFIX)).sort();
  const entries: RedactionRegisterEntry[] = [];
  for (const key of keys) {
    const entry = parseEntry(await storage.getObject(key));
    if (Date.parse(entry.appliedAt) >= since.getTime()) entries.push(entry);
  }
  return entries;
}
