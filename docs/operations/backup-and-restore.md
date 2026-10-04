# Backup and restore runbook — B22

**Status:** B22 (2026-10-04). Procedures for restoring the database, recovering objects, and putting
a restored system back into a trustworthy state. Targets: [recovery-objectives.md](recovery-objectives.md).
Failure modes that need no restore: [failure-runbooks.md](failure-runbooks.md).

Steps marked **(B23)** depend on production infrastructure that B23 provisions; the commands and
checks around them are built and drilled now.

## 1. What is backed up, and how

| Data                                                          | Backup                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (authoritative: all academic data)                 | **(B23)** RDS automated backups — daily snapshot + transaction logs, **35-day** PITR window, encrypted with KMS; Multi-AZ. Term-close manual snapshots (§7). The local and CI drill uses the same method by hand: `pg_basebackup` + `pg_receivewal`, encrypted with `age`. |
| Object storage (logos, question media, import files, exports) | S3 **versioning**; noncurrent versions expire after **35 days** (retention rule `object-noncurrent-versions`). **(B23)** bucket lifecycle rule. The application role has no right to delete versions or change bucket configuration.                                       |
| Redis                                                         | **Not backed up, by design.** Nothing in it is authoritative; after a loss the worker's reconciliation re-creates owed jobs.                                                                                                                                               |
| Redaction register                                            | Object storage, prefix `ops/redaction-register/` (versioned like everything else). It is what keeps redactions applied after a database restore (§4).                                                                                                                      |

**Encryption and access.** Backups are encrypted at rest (RDS/KMS in production; `age` in the drill,
with the identity key in the secret manager — never in the repository). Restoring is an operator
action: only the operations role may restore or copy snapshots **(B23 IAM)**, and every restore is
recorded in the incident log with who, when, the restore point and why. The application role
cannot read backups.

## 2. Decide: failover, PITR, or neither

| Situation                                                          | Action                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database instance or AZ down                                       | Nothing: Multi-AZ fails over by itself. Follow [failure-runbooks.md §5](failure-runbooks.md). No restore.                                                                |
| Data is wrong (bad migration, a destructive statement, corruption) | **PITR** to just before the damage (§3). Every write after the restore point is rolled back — including students' answers — so weigh it against a targeted repair first. |
| One file deleted or overwritten                                    | Object version recovery (§5). No database restore.                                                                                                                       |
| A failed background job                                            | Job replay (§6). No restore.                                                                                                                                             |

A PITR during exam hours rolls back live exams. If exams are running, decide with the school(s)
first: the alternative (repair forward) keeps every answer.

## 3. Point-in-time restore (database)

1. **Freeze writes.** Put the API in maintenance (scale the API service to 0 **(B23)**) so nothing
   more is written to the damaged instance. Tell invigilators (failure-runbooks.md §1): students
   keep answering offline; **nobody reloads or closes the exam page.**
2. **Pick the restore point** `T`: just before the first damaging statement (from the audit trail,
   application logs, or the migration log). Write it down in UTC.
3. **Restore into a NEW instance** to `T` **(B23: `aws rds restore-db-instance-to-point-in-time`)**.
   Never overwrite the old instance — it is the evidence and the input to step 6.
4. **Verify** the restored database before anything uses it:

   ```bash
   pnpm --filter @atlas/api ops:restore-verify -- --database-url <owner url of the restore>
   ```

   It exits non-zero on any error: half-applied migrations, a table without forced RLS, an
   application role that could bypass RLS, an answer row without its event, a finalised attempt
   without a result, a FINAL result with an unmarked question or a wrong total. Warnings (marking
   still owed) resolve once the worker runs. Stop here on an error — restore to a different point.

5. **Re-apply redactions** made after `T` (the restore brought those people's data back):

   ```bash
   pnpm --filter @atlas/api ops:redact-subject -- --replay --since <T> --actor <adminUserId>          # dry run
   pnpm --filter @atlas/api ops:redact-subject -- --replay --since <T> --actor <adminUserId> --apply
   ```

6. **List the attempts the rollback touched**, comparing the old instance with the restore:

   ```bash
   pnpm --filter @atlas/api ops:attempts-affected -- --old-url <old instance> --restored-url <restore>
   ```

   and send each school its list (ids only — the school looks students up in its own console).
   What each kind means and what the school does: §4.

7. **Point the application at the restored instance** (`DATABASE_URL`/`DATABASE_APP_URL`; the
   migration deploy wrapper reasserts `atlas_app`'s grants) and bring the API and worker back.
   Redis is left as it is: it is not authoritative, and the worker reconciles owed marking within
   about two minutes.
8. **Watch** the Exam Health Monitor and `atlas.work.reconciled` until owed marking drains, then run
   `ops:restore-verify` once more.
9. **Keep the old instance** (stopped, encrypted) until the schools have acted on step 6, then
   delete it — it holds data the restore discarded.

## 4. Attempts caught by a rollback (decided, project-owner 2c, 2026-10-04)

Students whose exam page **stays open** lose nothing they answered: when the client reconnects it
asks the server what it holds and re-sends every answer the server no longer has
(`sync-engine.ts` `reconcileWithServer`). A page that **was reloaded** re-sends everything still on
the computer on load. That is why invigilators must stop students reloading during an incident.

| Report kind           | What happened                                    | What the student sees                                                                                                              | What the school does                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MISSING`             | Attempt started after `T`; it no longer exists   | "Your assessment could not be found on the server. Your answers are still saved on this computer…" — answers are **not** discarded | As far as the server knows the student never started, so the attempt limit is unused: while the session is open the invigilator takes the student back to the dashboard and they **start again**. If the session has closed, authorise a **makeup** (Exam Control Center → Participation; ADR-0014). |
| `STATE_ROLLED_BACK`   | Submitted after `T`; open again                  | Nothing new while the page is open                                                                                                 | Nothing usually: the auto-submit sweeper finalises it when its time runs out, with every answer the client re-sent before then.                                                                                                                                                                      |
| `ANSWERS_ROLLED_BACK` | Answers saved after `T` are gone from the server | Nothing: an open client re-sends them                                                                                              | Check the attempt once it closes; if answers are still missing (page closed, computer lost), decide: accept, or RETRY.                                                                                                                                                                               |
| `RESULT_ROLLED_BACK`  | A FINAL result is PROCESSING again               | The result is "being marked" for a few minutes                                                                                     | Nothing for marking (it re-runs by itself). A publication made after `T` must be made again.                                                                                                                                                                                                         |

Answers that arrive after an attempt's time and grace window are kept as evidence
(`attempt_answer_events`, `accepted = false`) and **never scored** (ADR-0003).

## 5. Recovering an object version

Every object is versioned. To bring back a deleted or overwritten file (within 35 days):

```bash
aws s3api list-object-versions --bucket <bucket> --prefix <key>
aws s3api copy-object --bucket <bucket> --key <key> \
  --copy-source "<bucket>/<key>?versionId=<version id>"
```

The copy becomes the current version; the database row (`media_assets.storage_key`) is unchanged
because keys never change (D-13). Never bring back an import source file (`import_jobs.source_purged_at`
set) or anything a redaction deleted — those deletions are deliberate.

## 6. Replaying failed background jobs

Marking and result adjustments are re-queued automatically (the worker's reconciliation pass, at
most three automatic retries per job). For what it left `exhausted`, and for imports, exports,
pre-cache and notifications:

```bash
pnpm --filter @atlas/api ops:replay-jobs -- --actor <adminUserId> --reason "<incident ref>"            # list
pnpm --filter @atlas/api ops:replay-jobs -- --actor <adminUserId> --reason "<incident ref>" --apply    # retry
```

Failed jobs are kept 14 days. Each `--apply` writes one `JOB_REPLAYED` platform audit event.

## 7. Term-close snapshot

When a school's term results are published (or, platform-wide, at the end of each term), take a
manual snapshot named `atlas-term-<academic-session>-<term>` **(B23: AWS Backup plan or
`aws rds create-db-snapshot`)**. Retention is the proposal in
[recovery-objectives.md](recovery-objectives.md#long-term-academic-records--proposed-policy-for-b23-legal-review)
(3 years; the year's last one 7 years, copied to a second region), pending the B23 legal review.

## 8. Restored copies outside production

A restored copy may be used outside operations (staging, debugging) **only after anonymisation**
(`08 §22`):

```bash
pnpm --filter @atlas/api ops:anonymise-copy -- --database-url <copy> --confirm-copy <copy's database name>
```

It refuses this environment's own database. It replaces names, emails, credentials, sign-in
identifiers, student/staff/admission numbers, raw import cells, notification text, IP addresses,
user agents, school contact details, file names and audit reasons, and deletes sessions and tokens;
every id and academic row stays, so the copy behaves like the original. Run `ops:restore-verify` on
it afterwards. The drill does both on every run.

## 9. The drill

`infra/dr/pitr-drill.sh` runs this runbook's database half end to end on a self-built cluster —
encrypted backup, WAL archive, PITR to a timestamp, verification, attempts-affected report, golden
path on the restore, anonymisation, crash recovery to the end of the archive — and writes a report to
`docs/performance/results/<stamp>-dr-drill.md`. CI runs it weekly and on changes to the restore
tooling (`.github/workflows/dr-drill.yml`). Locally:

```bash
pnpm turbo run build --filter=@atlas/api --filter=@atlas/worker
bash infra/dr/pitr-drill.sh                  # DRILL_PAD_SCALE=200 for a ≈3 GB cluster
```
