# Recovery objectives (RPO / RTO) — B22

**Status:** targets **defined in B22** (project-owner decision 2, 2026-10-04) and **verified locally
where possible**. Nothing on this page is "measured" against the production stack until B23 measures
it on staging (RDS, ElastiCache, S3); each row says which state it is in. `08 §21` requires these
before launch.

- **RPO** — the most data, in time, a failure may lose.
- **RTO** — the longest the service may be unavailable (or a school's data unusable) after the failure.

## Targets by failure class

| Failure class                                                                          | Protection                                                                                                                                      | RPO target                                                                                                                            | RTO target                                                                                   | State                                                                                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Database host, disk or Availability Zone lost                                          | RDS **Multi-AZ** (synchronous standby, automatic failover)                                                                                      | **≈ 0** (synchronous replication)                                                                                                     | **a few minutes** (failover + reconnect)                                                     | Defined. Locally: Postgres restart mid-exam loses nothing (chaos `pg-restart`). **Failover time measured on staging (B23).**     |
| Data corruption or operator error (bad migration, wrong `UPDATE`, accidental deletion) | **Point-in-time recovery** into a new instance: RDS automated backups (daily snapshot + transaction logs, 35-day window)                        | **≤ 5 min** (RDS uploads transaction logs every 5 minutes)                                                                            | **≤ 60 min** to a verified database, **measured against a production-sized dataset**         | Defined. Locally verified by the PITR drill (below). **Not measured on RDS yet — B23 staging, with a production-sized dataset.** |
| Redis lost or emptied                                                                  | Nothing to restore: Redis is never authoritative (AGENTS.md §4). The worker's reconciliation pass re-creates owed marking and adjustment jobs   | **0** for academic data. Lost: in-flight rate-limit counters, idempotency keys (a retried request is still safe: ADR-0007 sequencing) | **0** for exams (answers, submit and sign-in work while Redis is down); jobs resume ≤ ~3 min | Verified locally: chaos `redis-hang`, `redis-data-loss`; W1/W2 integration tests. ElastiCache failover time on staging (B23).    |
| Object deleted or overwritten                                                          | S3 **versioning**; noncurrent versions kept **35 days** (matches the PITR window, so a restored database never points at an expired version)    | **0** within 35 days                                                                                                                  | minutes (copy the old version back — [backup-and-restore.md §5](backup-and-restore.md))      | Verified locally against MinIO (`object-versioning.integration.test.ts`, CI). Bucket lifecycle rule is B23 infrastructure.       |
| Object storage unavailable                                                             | Exams do not depend on it once media is cached (ADR-0021); uploads, exports and pre-cache keep their retry state                                | 0                                                                                                                                     | the provider's; exams unaffected                                                             | Verified locally: chaos `storage-hang`, W4 tests.                                                                                |
| API node or worker lost                                                                | Stateless nodes behind the load balancer; BullMQ retries; idempotent marking                                                                    | 0                                                                                                                                     | seconds (next node serves; ECS replaces the task)                                            | Verified locally: chaos `api-kill9`, `api-term`, `api-hang`, `worker-kill9`, `worker-kill-expiry`.                               |
| Region lost                                                                            | **Not covered at launch** — single region (roadmap B22 deferred item "multi-region failover"). Proposal below: cross-region copies of snapshots | proposal: ≤ 24 h (last cross-region snapshot copy)                                                                                    | proposal: ≤ 24 h (new stack in a second region from IaC)                                     | **Open — decision for B23** (cost and the ADR-0032 region choice).                                                               |

Exam data has recovery priority (`08 §21`): in any restore, attempts, answers and results are
verified first (`ops:restore-verify`) and the attempts the rollback touched are listed for the
schools (`ops:attempts-affected`) before anything else is brought back.

## What "verified locally" means here

The B22 drill (`infra/dr/pitr-drill.sh`, weekly in CI — `.github/workflows/dr-drill.yml`) takes an
encrypted base backup and a continuous WAL archive of a real-schema cluster with exams sat through
the real API, then:

- restores to a chosen timestamp: work before it present, work after it absent, integrity checks
  pass, the golden path (start → answer → submit → mark) runs against the restored copy;
- restores to the end of the archive after an immediate-mode crash and counts acknowledged commits
  lost.

The local numbers (latest runs: [`../performance/results/`](../performance/results/), `*-dr-drill.md`
— 340 MB restored and verified in 6 s, 3.0 GB in 23 s, ≈ 130 MB/s; 0 acknowledged commits lost
after an immediate-mode crash) prove the procedure and give a restore throughput. Extrapolated, not
measured: ≈ 55 min for the year-one ≈ 420 GB projection on comparable storage — close enough to the
60-minute target that it must be measured, not assumed. None of this says anything about RDS restore speed, which
depends on instance class and storage. That is why the 60-minute RTO stays a **target** until B23
restores a production-sized dataset on staging.

**Production-sized** for that measurement: the storage projection in
[`../performance/capacity-plan.md` §8](../performance/capacity-plan.md) — ≈ 52 KB per attempt, so
year one at 100 schools of 600 students is ≈ 420 GB. B23 restores at least the projected size at
launch + 12 months.

## Long-term academic records — proposed policy (for B23 legal review)

ADR-0028 keeps academic evidence and audit **indefinitely in the live database** — never purged.
Backups are a separate question: the PITR window is only 35 days, so without more, a record damaged
and noticed later than that could not be recovered from backup. Proposal (project-owner decision 2
asked for one; it is **not decided** until the B23 legal review confirms it):

1. **Term-close snapshot.** At the close of every term (when results are published), a manual,
   encrypted RDS snapshot `atlas-term-<academic-session>-<term>` is taken and kept **3 years**.
   (Procedure: [backup-and-restore.md §7](backup-and-restore.md).)
2. **Year-end snapshot.** The last term-close snapshot of each academic year is kept **7 years**,
   with a copy in a second AWS region (also the region-loss protection above).
3. **Restores from these snapshots** go through the same verification and, outside production, the
   same anonymisation as any restore.
4. **Redactions survive restores.** Every applied data-subject redaction is in the redaction
   register (outside the database) and is re-applied after any restore (`ops:redact-subject --replay`).
   A snapshot older than a redaction therefore never re-exposes the person in a running system; the
   snapshot itself still holds the data until it expires, which the DPA must state.

Questions for the legal review (added to B23): whether 3 and 7 years match NDPA 2023 and any
Ministry of Education record-keeping rule for examination records; whether snapshots holding a
redacted person's data until expiry is acceptable as stated in the DPA; whether a cross-border copy
(second region) needs its own basis.
