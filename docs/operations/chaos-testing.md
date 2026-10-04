# Chaos testing the exam path — B22

**Status:** B22 (2026-10-04). How the failure modes in [failure-runbooks.md](failure-runbooks.md) are
induced, and what the latest run showed. Roadmap B22 "Chaos: kill an API node mid-exam; kill a
worker mid-marking; drop Redis; drop object storage — assert no attempt, answer, or result is lost
or duplicated".

## The harness

`pnpm --filter @atlas/load load chaos` (`tools/load/src/chaos.ts`) owns the processes it faults:
it starts two API processes (`--ports`, default 3101,3102) and the worker from their production
builds, so every fault is a real signal to a real process — `SIGKILL`, `SIGTERM`, `SIGSTOP` (a hung
node, or a network partition as its callers see it) — and Redis, object storage and Postgres on the
same host are faulted in place (`SIGSTOP`, `FLUSHALL`, `pg_terminate_backend`, a restart).
Students fail over between API processes the way a load balancer moves them off a dead node.

Each row is a fresh exam per school with `--n` students (default 200) signing in, starting and
answering continuously (an answer every `--answer-interval` ms on average, heartbeats every 30 s),
the fault injected and recovered, everyone submitted (or their time left to run out), marking
drained, and then the oracle run against the database:

| Check                                                           | Why                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| attempts created = students; 0 duplicates                       | never a second attempt (08 §25 "never duplicate")        |
| acknowledged answers lost = 0                                   | every answer the server said it saved is in the database |
| answer rows without their accepted event = 0                    | answer row and event log written together (ADR-0007)     |
| attempts left `IN_PROGRESS` = 0                                 | every attempt finalised, by submit or by the sweeper     |
| attempts without a result = 0; results not FINAL = 0            | marking resumed and finished                             |
| results with a question unmarked = 0; totals ≠ sum of marks = 0 | no partial or duplicated marking                         |
| finalisation audited exactly once per attempt                   | the audit is in the transition's transaction (B22)       |
| marking jobs left failed = 0                                    | nothing stranded in the queue                            |

```bash
pnpm turbo run build --filter=@atlas/api --filter=@atlas/worker
pnpm --filter @atlas/load provision --name b22 --schools 4 --students 60 --questions 20 --target http://127.0.0.1:3101/v1
pnpm --filter @atlas/load load chaos --name b22 --rows all --n 200 --answer-seconds 60 --answer-interval 5000 --tag b22
```

Provisioning needs one API running; the chaos command starts and stops its own. `--rows` takes ids
from the table below. Reports go to `docs/performance/results/<stamp>-chaos-<row>-<tag>.{md,json}`,
with the fault timeline and per-exam integrity counts. `CHAOS_PG_RESTART` (default
`pg_ctlcluster 16 main restart`) and `CHAOS_STORAGE_PATTERN` (default `s3rver|minio server`) adapt
the host faults to another machine.

## Rows and the latest results

Run 2026-10-04, 4 schools × 50 students (200 per row), answering for 60 s at one answer per 5 s; reports in `docs/performance/results/2026-10-04T*-chaos-*-b22*.md`. Every row's oracle (the table above) came back clean: 0 duplicate attempts, 0 acknowledged answers lost, 0 answers without their event, 0 attempts left open, every result FINAL with correct totals, finalisation audited exactly once.

| Row                  | Fault                                                                                              | Outcome                                                                                                                                                                                                                                                   | Result           |
| -------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `api-kill9`          | An API process SIGKILLed mid-exam; restarted 13 s later                                            | 0 of 2,996 lost; 82 failed answer batches retried on the other node; drained 2.2 s                                                                                                                                                                        | PASS             |
| `api-term`           | An API process sent SIGTERM mid-exam (deploy/scale-in)                                             | drained and back in 2.6 s; 0 of 2,670 lost                                                                                                                                                                                                                | PASS             |
| `api-hang`           | An API process frozen (SIGSTOP) 20 s                                                               | requests waited and completed on resume; 0 of 3,154 lost; 100 % answer-save success                                                                                                                                                                       | PASS             |
| `worker-kill9`       | The worker SIGKILLed twice while a submit burst's marking drained                                  | marking resumed and drained 32 s after the second restart; no partial or duplicated results                                                                                                                                                               | PASS             |
| `worker-kill-expiry` | The worker down 110 s across the exam's expiry and grace (students stop answering, nobody submits) | sweeper finalised every attempt on return; marking drained 6.1 s later                                                                                                                                                                                    | PASS             |
| `redis-hang`         | Redis frozen 45 s while everyone submits                                                           | every submit succeeded during the outage (p95 3.2 s); marking queued by reconciliation, drained 5.1 s after resume                                                                                                                                        | PASS             |
| `redis-data-loss`    | Redis FLUSHALL with every marking job of a submit burst still queued                               | **failed first** (results stayed `PROCESSING`: the wipe also deleted the worker's job schedulers, so the sweep and reconciliation never ran). Fixed with the schedule guard; re-run: schedulers re-registered within 30 s, every result FINAL after 136 s | PASS (after fix) |
| `storage-hang`       | Object storage frozen 30 s mid-exam                                                                | exam unaffected; 0 of 3,506 lost                                                                                                                                                                                                                          | PASS             |
| `pg-terminate`       | Every application connection to Postgres terminated, twice, mid-exam                               | 2 answer batches retried; 0 of 3,028 lost                                                                                                                                                                                                                 | PASS             |
| `pg-restart`         | Postgres restarted mid-exam                                                                        | back in 2.4 s; 0 of 2,527 lost                                                                                                                                                                                                                            | PASS             |

## What it does not cover

- Real network partitions between hosts and real multi-AZ failover — single host here; RDS and
  ElastiCache failover are measured on staging (B23).
- A student's browser: the harness is a protocol-level client (the same requests as the F13 engine).
  The browser half — reload with unsent answers, reconnect after a rollback — is
  `apps/web/e2e/recovery.spec.ts` and `sync-engine.rollback.test.ts`.
