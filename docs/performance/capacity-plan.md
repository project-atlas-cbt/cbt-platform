# Capacity plan (B21)

**Status:** B21, 2026-10-03. Measured on one 4-vCPU host; **the B23 staging re-run is the gate**
for the 1,000-attempt latency items (project-owner decision, 2026-10-03, below). Companion to
[`scaling-runbook.md`](./scaling-runbook.md) (what operators do) and
[`load-testing.md`](./load-testing.md) (how every number here was produced). Every figure links to a
report in [`results/`](./results/); [`results/README.md`](./results/README.md) says which runs are
valid evidence.

## 1. Where the numbers come from

| Item           | Value                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Host           | Claude Code cloud VM: Intel Xeon @ 2.10 GHz, **4 vCPU, 15.7 GB RAM**, disk fdatasync 4,113 ops/s (243 µs) by `pg_test_fsync`            |
| Database       | PostgreSQL 16.14 (+ `uuidv7()` shim; production is 18), defaults (`max_connections` 100, `shared_buffers` 128 MB), **on the same host** |
| Pooler         | PgBouncer 1.22, transaction mode, `default_pool_size` 40 — the local stand-in for **RDS Proxy** (project-owner decision, 2026-10-02)    |
| API            | **2 processes**, `DATABASE_POOL_MAX=20` each, `LOG_LEVEL=warn`; worker with `MARKING_CONCURRENCY=4`                                     |
| Load generator | `tools/load` on the **same host** (models the F13 client: batches, one flush in flight, 30 s heartbeat, sequence numbers)               |
| Write model    | one answer change per student every 10 s on average (`08 §20`, audit R-03); 40-question papers; labs of 40 behind one NAT address       |

Everything — Postgres, PgBouncer, Redis, two APIs, the worker and the 1,000-student load generator —
shares 4 vCPU. Production separates the database (RDS) from the API tasks (ECS), so these numbers are
a **floor**: per-component costs below are what transfer, not the host's total throughput.

## 2. Budgets (project-owner agreement, 2026-10-02)

Server-side, as observed by the client on a clean network (`tools/load/src/metrics.ts` `BUDGETS`):

| Path                     | Budget                                       |
| ------------------------ | -------------------------------------------- |
| Answer save              | p95 ≤ 250 ms, p99 ≤ 750 ms, success ≥ 99.9 % |
| Start, submit            | p95 ≤ 2 s                                    |
| Burst (500 start/submit) | whole burst ≤ 60 s, exact counts             |
| Lab burst (40 clients)   | whole lab ready ≤ 60 s                       |
| Analytics                | cold p95 ≤ 3 s, cached p95 ≤ 300 ms          |

## 3. Results against the Definition of Done

| DoD                                                      | Result                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. 1,000 sustained within budget                         | **Partial — gated to B23.** Answer saves meet budget over the clean endurance hour _including_ the arrival ramp (p95 97 ms, p99 545 ms, 100 % success); start p95 (6.4 s) misses during the 60 s arrival of 1,000 students on this shared host, and 10-minute runs miss on answer-save too because the ramp weighs more in a short run (§4). 0 lost answers anywhere. | `…10-20-39-levels-1000-cloud`, `…10-34-08-…-diag-series`, `…10-51-10-…-ramp120`, `…15-10-45-…-endurance-jitter` |
| 2. 500 simultaneous starts → exactly 500                 | **Met.** 1,000 requests (each start double-fired) → 500 attempts, 0 duplicates, burst 15.1 s. Per-request p95 15 s is queue depth, not a correctness issue.                                                                                                                                                                                                           | `…11-01-06-start-burst-cloud`                                                                                   |
| 3. 500 simultaneous submissions → exactly 500 results    | **Met.** 500 results, 0 lost answers, burst 7.7 s, marking drained in 10.1 s.                                                                                                                                                                                                                                                                                         | `…11-01-45-submit-burst-cloud`                                                                                  |
| 4. Answer-save p95/p99 at every level                    | **Met at 20, 100, 500** (p95 36 / 31 / 37 ms). **1,000: as DoD 1.**                                                                                                                                                                                                                                                                                                   | `…09-43-25-levels-20-cloud`, `…09-55-49-levels-100-cloud`, `…10-08-14-levels-500-cloud`                         |
| 5. Pooling prevents exhaustion                           | **Met.** Peak 45–48 server connections at every level up to 2,000 attempts behind PgBouncer; 0 lock waits; pooler tenant-isolation test (§7).                                                                                                                                                                                                                         | sampler in every report                                                                                         |
| 6. Snapshot/answer growth measured and projected         | **Met** (§8).                                                                                                                                                                                                                                                                                                                                                         | `…10-20-39-levels-1000-cloud` growth table, analytics dataset                                                   |
| 7. SSE scaling                                           | **Met.** 60 Control Center streams held for a 500-attempt exam, 10,805 frames, 0 errors, all exam budgets met; new streams refused (polling fallback) while shedding.                                                                                                                                                                                                 | `…12-42-25-sse-500-cloud-sse`                                                                                   |
| 8. Nigerian network conditions incl. 40-client lab burst | **Met for text and typical links; not met for media-heavy papers on a congested 2 Mbit lab link** — a bandwidth limit, not a server one (§9).                                                                                                                                                                                                                         | `…09-1*-lab-burst-*` (workstation, valid)                                                                       |
| 9. Load shedding preserves exam execution                | **Met after fixes found here** (§6): answer-save p95 75 ms / p99 198 ms under a 20-session reporting flood, reporting degraded to 503 + `Retry-After`.                                                                                                                                                                                                                | `…17-34-53-shed-500-cloud-shed-final-code` (history: §6)                                                        |
| 10. Analytics on realistic volumes                       | **Met after two fixes found here** (§10): every view within budget on a term's data (school cold 2.5 s, previously > 30 s).                                                                                                                                                                                                                                           | `…13-46-04-analytics-cloud-sql-aggregates` (before: `…13-33-37`)                                                |
| 11. Capacity plan and runbook from evidence              | This document and `scaling-runbook.md`. Reviewed and accepted at B23 with the staging re-run.                                                                                                                                                                                                                                                                         | —                                                                                                               |

Correctness held in **every** run, including the overloaded stress levels: **no duplicate attempt and
no lost acknowledged answer** in 27 runs (413,538 acknowledged answers checked against the
database).

## 4. Where the time goes at 1,000 attempts

Per-minute series (`--series`) and per-process CPU sampling separate three phases:

| Phase                                      | Answer-save p95               | Host CPU (of 400 %)               | Binding resource                               |
| ------------------------------------------ | ----------------------------- | --------------------------------- | ---------------------------------------------- |
| Arrival: 1,000 sign-ins and starts in 60 s | 1.9–3.1 s                     | ~370 % (APIs ~210, Postgres ~105) | API CPU — each Node process pinned at one core |
| Steady state                               | **53–98 ms** (p99 102–272 ms) | ~225 % (APIs ~135, Postgres ~63)  | none                                           |
| Submit wave + marking                      | 0.9–4.1 s                     | ~280 %                            | API CPU + marking                              |

The database is not the bottleneck at this scale: peak 5 active backends, every hot statement
sub-millisecond, 0 lock waits, checkpoints spread evenly. A CPU profile of one API process during the
ramp shows it ~96 % busy, with the largest share in the Prisma 7 client runtime (query planning and
result mapping in-process), then GC and socket writes. Spreading the same 1,000 arrivals over 120 s
brings start p95 to 1.18 s and answer-save p99 to 638 ms (both within budget).

**Per-process cost** (steady state): ~138 exam requests/s cost ~135 % CPU, i.e. **≈ 10 ms of API CPU
per exam request** and **≈ 58 ms per arrival** (sign-in, tenant resolve, preview, assessment, start).
Argon2 is a small part of that (18 ms per verify on this CPU).

**Owner decision (2026-10-03):** document and gate. The steady-state pass and these per-process
costs size production; DoD 1 and 4 at 1,000 are confirmed by re-running level 1,000 on staging (API
on ECS, database on RDS, load generator off-host) before launch (B23). Optimising the per-request
API CPU (fewer Prisma round trips on the guard and answer path) is **Candidate / Deferred** — it
would need a careful review of the guard's live-state checks (`09 §25`, ADR-0022).

## 5. API sizing

With a 10 s answer interval and a 30 s heartbeat, one attempt generates ~0.14 exam requests/s.

| Quantity                                         | Value                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Exam requests per API vCPU at ≤ 70 % utilisation | ~70 req/s ≈ **500 concurrent attempts per API vCPU**                                |
| Arrival capacity per API vCPU (≤ 70 %)           | ~12 sign-in-and-start per second                                                    |
| 1,000-attempt exam, arrivals over 60 s           | steady ~2 vCPU + arrival ~1 vCPU → **4 tasks × 1 vCPU** (ELU shedding trips at 0.9) |

Each API task runs one Node process (single-threaded for request handling), so scale **out**, not up:
more 1-vCPU tasks, not larger ones. Tasks are stateless (`08 §6`, `09 §41`).

## 6. Load shedding (R-12) — what the stress runs changed

The B21 monitor shipped with two triggers, event-loop delay p99 and in-flight requests. Under a
20-session reporting flood at level 500 **neither fired** while answer-save p95 rose to 679–876 ms:
a CPU-pegged Node process leaves requests waiting in socket buffers before any middleware runs, so
event-loop delay stays ~30 ms. Four rounds of evidence produced the final design:

1. Event-loop **utilisation** and exam write-path **latency** triggers added — utilisation tripped,
   answer-save p95 93 ms (`…13-13-36-…-shed-elu-backoff`).
2. A single school-wide analytics request with no exam running then shed reporting cluster-wide for
   30 s, so the CPU-shaped triggers were gated on exam traffic being present.
3. After the analytics fix made reporting cheap, the flood sent ~90 req/s and nothing tripped
   (p95 520–594 ms). The cause was a defect, not calibration: under Fastify's middleware layer
   `req.url` reads `/`, so the monitor had **never seen an exam write** — the latency signal was dead
   from the start and the gated signals died with step 2. Fixed (`originalUrl`, unit-tested).
4. A **reporting bulkhead** bounds reporting's share regardless of thresholds.
5. The security suites then failed: their hundreds of refused `/attempts/*` probes per second
   (401/403/404) counted as exam traffic, switched protection on and the bulkhead refused import
   and report routes. Refused (4xx) exam-path calls no longer count; successes and server errors
   do — so neither a probe nor an attacker can switch exam protection on.

| Mechanism (per API process)                                  | Default                             | Active                          | Catches                                |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------- | -------------------------------------- |
| Reporting bulkhead: concurrency                              | `LOAD_SHED_REPORTING_CONCURRENCY=4` | while serving exam writes       | slow, heavy reports                    |
| Reporting bulkhead: rate (token bucket)                      | `LOAD_SHED_REPORTING_RATE=10`/s     | while serving exam writes       | many cheap reports (the measured case) |
| Event-loop utilisation, 3 consecutive 1 s windows            | `LOAD_SHED_ELU=0.9`                 | while serving exam writes       | CPU-pegged process                     |
| Event-loop delay p99, 3 windows                              | `LOAD_SHED_EVENT_LOOP_P99_MS=200`   | while serving exam writes       | blocking work on the loop              |
| Exam write-path (`/attempts/*`) p95, 3 windows, ≥ 20 samples | `LOAD_SHED_EXAM_P95_MS=200`         | needs exam writes by definition | slow database                          |
| In-flight requests                                           | `LOAD_SHED_MAX_IN_FLIGHT=256`       | always                          | bursts                                 |

"Serving exam writes" = at least 20 exam write-path requests in the last second on that process.
A trip sheds reporting for `LOAD_SHED_HOLD_MS` (30 s) on every process (cluster signal) and pauses
the worker's non-critical queues; the bulkhead refuses individual requests and is not a shed level.

**Result on the final code** (`…17-34-53-…-shed-final-code`): answer-save p95 **75 ms**, p99 198 ms,
start p95 1.3 s, submit p95 0.4 s — every budget met — while reporting was degraded (~5,450
requests served, ~350 refused with 503 + `Retry-After`), not switched off. A client that ignores `Retry-After` and retries at once
still costs CPU per refused request (~2,000 req/s of 503s held p95 at 295 ms in round 1) — **the web
client must back off on 503** (F20).

## 7. Connection budget

Observed behind the pooler at every level up to 2,000 attempts: **45–48 server connections**, peak 5
active, up to 37 idle-in-transaction (interactive Prisma transactions waiting on the Node process
between statements — the reason the pooler, not Postgres, should absorb client connections).

| Client        | Connections                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Each API task | `DATABASE_POOL_MAX` = **20**                                                                    |
| Worker        | its pool (`DATABASE_POOL_MAX`) — marking holds one per concurrent job (`MARKING_CONCURRENCY=4`) |
| Budget        | (API tasks + worker tasks) × `DATABASE_POOL_MAX` ≤ the proxy's client limit                     |

**RDS Proxy:** set `MaxConnectionsPercent` so the proxy's backend share stays well under the
instance's `max_connections` (e.g. 50 %), leaving headroom for migrations and operators. With 4 API
tasks + 1 worker at 20 that is 100 client connections, multiplexed onto far fewer backends.
Tenant context is transaction-local (`set_config(…, true)` inside each `withTenant` transaction,
ADR-0023), so transaction pooling cannot leak it — proven against PgBouncer by
`tests/tenancy/pooler-tenant-isolation.integration.test.ts`. **B23 must confirm RDS Proxy does not
pin** on this pattern (check `DatabaseConnectionsCurrentlySessionPinned`).

## 8. Storage growth (R-05, DoD 6)

Measured per attempt (40-question paper, `pg_total_relation_size` deltas including indexes, level 1,000):

| Table                                                                     | Bytes / attempt                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `attempt_answer_events` (ADR-0007 log, ~1.7 events per answered question) | 17,654                                                   |
| `attempt_answers`                                                         | 12,108                                                   |
| `attempt_question_results`                                                | 11,354                                                   |
| `attempt_question_snapshots` (one JSONB document, ADR-0008)               | 10,830                                                   |
| `audit_events`                                                            | 1,589                                                    |
| `exam_attempts`, `attempt_events`, `results`, participation rows          | ~3,000                                                   |
| **Total**                                                                 | **≈ 57 KB per attempt** (≈ 1.4 KB per question answered) |

**A term of a large school, measured.** `dataset --name analytics --exams 47` built one school of
1,200 students in 30 arms sitting 47 real exams (each created, opened and marked through the API,
the rest of the attempts cloned in SQL with every trigger active): **53,680 attempts, 2.1 million
answer and per-question result rows, 1.78 GB** — ≈ 34.8 KB per attempt _without_ the per-change
answer events (the clone writes final answers only). Adding the measured ≈ 17.7 KB of events gives
**≈ 52 KB per attempt, ≈ 2.8 GB per term** for that school, consistent with the 57 KB measured under
live load.

| School size                        | Attempts / term (≈ 45 per student) | Per year (3 terms) |
| ---------------------------------- | ---------------------------------- | ------------------ |
| 300 students                       | ~13,400                            | ~2.1 GB            |
| 1,200 students                     | ~53,700                            | ~8.4 GB            |
| 100 schools averaging 600 students | ~2.7 M                             | ~420 GB            |

All of it is academic evidence kept indefinitely (retention schedule, ADR-0028 amendment), so the
total only grows. **Storage strategy: adequate for launch without partitioning.** Every hot table
leads its indexes with `school_id` (ADR-0023), every exam-path query is a point lookup on
(`school_id`, attempt), and no exam-path statement degraded as the tables grew from empty to the
dataset's 2.1 M-row tables (answer-save p95 is the same in the 20-attempt run and in the
1,000-attempt runs that followed the dataset). **Revisit trigger:** when `attempt_answers` or
`attempt_question_results` pass ~200 M rows, or the database passes ~1 TB, decide between
partitioning by `school_id` hash and archiving closed sessions — a B23-or-later decision, measured
on production growth. Opening an exam session writes one participant row per eligible student
(ADR-0006): **5.4–8.0 s for 1,200 students** — a one-off staff action, within reason, noted for
schools larger than this.

## 9. Network and the 40-client lab (R-08, R-09, DoD 8)

Measured through a `tc netem` relay (workstation runs, valid — `results/README.md`):

| Profile                                          | Paper                     | Whole lab ready           | Result   |
| ------------------------------------------------ | ------------------------- | ------------------------- | -------- |
| clean                                            | 150 KB image per question | 20.5 s                    | pass     |
| `ng-typical` (150 ms RTT, 1 % loss)              | 150 KB image per question | 56.1 s                    | pass     |
| `ng-congested` (300 ms, 3 % loss, 2 Mbit shared) | text only                 | 23.2 s                    | pass     |
| `ng-congested`                                   | 150 KB image per question | 3 of 40 ready after 224 s | **fail** |

The last row is arithmetic, not a server limit: 40 students × 40 questions × 150 KB = 240 MB, and a
2 Mbit/s uplink moves ~15 MB per minute (**≈ 375 KB per student per minute** across 40). Because
ADR-0021 blocks Start until media is cached, a media-heavy paper cannot start within 60 s on such a
link. Consequences: **media must be pre-cached before the exam window** (the F20 client and B23
operational guidance: open the paper's pre-cache step at the start of the lab session, not at the
bell), and authoring guidance should keep question images small. Answer saves themselves are tiny
and unaffected by the link once the attempt has started.

**Region (ADR-0032):** TCP RTT from the project owner's Nigerian connection (60 samples per region,
idle machine): `af-south-1` p50 115 ms, `eu-west-2` 159 ms, `eu-west-1` 186 ms, `eu-central-1`
185 ms; 0–7 % SYN loss. This meets ADR-0032's own revisit condition; see its 2026-10-03 amendment.

## 10. Analytics on realistic volumes (DoD 10)

Measured on the term dataset above (53,680 results, 2.1 M per-question rows), School Admin view (the
widest scope), each endpoint cold (cache version bumped) and cached, 10 samples each:

| View           | Cold p95   | Cached p95 | Before the B21 fixes   |
| -------------- | ---------- | ---------- | ---------------------- |
| School         | **2.51 s** | 22 ms      | **> 30 s** (timed out) |
| Department     | 1.54 s     | 22 ms      | **> 30 s** (timed out) |
| Exam           | 1.26 s     | 73 ms      | 1.23 s                 |
| Exam questions | 420 ms     | 61 ms      | 301 ms                 |
| Class          | 439 ms     | 48 ms      | 428 ms                 |
| Student        | 103 ms     | 56 ms      | —                      |

All within budget (cold ≤ 3 s, cached ≤ 300 ms). Two defects were found and fixed here:

- **Participation roll-up was quadratic** — each of ~56,000 participant groups scanned every
  participation and attempt row (~3 billion comparisons on the event loop). Now indexed once.
- **Metrics loaded every result row into the process** once per breakdown (per department, per
  session trend). They are now aggregated in the database (count, mean, highest, lowest, and grade
  counts for the frozen pass rate). All 10 analytics endpoints returned identical JSON before and
  after (3,206 values, 0 differences); the count-based pass rate is unit-tested equal to the
  row-based one.

The school-wide cold view is the closest to budget (2.5 of 3 s) and grows with a school's history;
the per-term filter the UI applies keeps it bounded, and the cached path (Redis, invalidated on
result changes) serves repeats in ~20 ms.

## 11. Background work

| Job                            | Setting                                                   | Evidence                                                                                                                  |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Marking                        | `MARKING_CONCURRENCY=4`                                   | 1,000 results FINAL 4.1–4.7 s after the last submit; 500-burst 10.1 s; 1,458 results in 23 s under 1,500-attempt overload |
| Auto-submit sweeper (ADR-0004) | `ATTEMPT_AUTO_SUBMIT_SWEEP_INTERVAL_MS=15000` (unchanged) | never in the top statements at any level; no contention with answer saves observed                                        |
| Control Center refresh         | `EXAM_CONTROL_REFRESH_INTERVAL_MS=5000`, full scan 60 s   | 60 streams, 0 errors; replay stream per exam bounded (`MAXLEN` 1,000, 2 h TTL)                                            |
| Heartbeat (ADR-0020)           | 30 s (F13), unchanged                                     | 22 % of exam requests at 1,000 attempts; its `UPDATE … last_seen_at` averages 0.07 ms                                     |

Background work never starved the interactive path in any run; under saturation the worker pauses
non-critical queues on the cluster shed signal.

**Redis:** the Control Center replay streams dominate memory — up to ~17 MB per live exam of 200
(1,000 entries × one snapshot), expiring 2 h after the last update; 374 MB peak with ~80 exams'
streams alive at once on the test host. Size the managed Redis for concurrent exams × that, plus
headroom; it holds no authoritative data.

## 12. Exam Health Monitor thresholds

Unchanged defaults are consistent with what was measured (see the runbook's 2026-10-03 note): no
healthy run came near `ANSWER_SAVE_SUCCESS_LOW` (success was 100 % everywhere), submission p95 above
5 s occurred only beyond capacity (stress levels, simultaneous 500-burst), and the marking backlog
never approached 500 jobs. `MARKING_QUEUE_BACKLOG` and `SUBMISSION_LATENCY_HIGH` are therefore real
capacity signals, not noise, at these thresholds.

## 13. Open items carried forward

- **B23 staging re-run (gate):** level 1,000 (60 s ramp), 500-bursts and the endurance hour on the
  production topology, load generator off-host. Accept DoD 1 and 4 there.
- **Endurance stalls — not reproduced on a clean host.** The first endurance hour had two
  windows (minutes 44–45, 56–57) at p95 1.3–4.7 s with ~250 requests in flight per API; the re-run
  was disturbed by an unidentified host process (up to 286 % CPU, 13:55–14:00) that stalled the
  load generator for up to 5.9 s, after which its fixed-interval heartbeats stayed in lockstep (1,000
  heartbeats every 30 s; heartbeat p50 33 → 257 ms). Postgres logged no lock waits, no checkpoint
  pressure and no slow exam-path statement in either. With the harness heartbeat jittered and a
  quiet host, the **third hour was clean**: whole-run answer-save p95 97 ms, p99 545 ms, 100 %
  success, no drift (`…15-10-45-levels-1000-cloud-endurance-jitter`). The cause of the first run's
  stalls is not proven; the B23 staging endurance hour (off-host generator) is the confirmation.
  **F20:** jitter the web client's heartbeat (`setInterval(30 s)` today) — a lab released together
  otherwise heartbeats in phase for the whole exam.
- **RDS Proxy pinning** check at B23 (§7).
- **F20:** honour `503 Retry-After` with backoff in the web client (it has no handling today);
  pre-cache paper media ahead of the exam window; keep the F13 batching/debounce the harness models.
- **ADR-0032** region decision with the owner at B23 (§9).
- **Candidate / Deferred:** per-request API CPU reduction on the exam path (§4).

## 14. Conflicts between specifications, ADRs, roadmap and code (re-derived)

The B21 plan's list of conflicts was written in an earlier session whose notes are not in the
repository. This list is re-derived from the specifications, ADRs, audit findings and code, and
records how each was settled.

1. **No latency budgets anywhere in the specifications.** `08 §20` and `09 §40` define the load
   levels and the write-pressure model but no numbers. Settled by the project owner (2026-10-02),
   §2.
2. **Pooler: "PgBouncer or RDS Proxy"** (roadmap) — owner chose RDS Proxy in production with
   PgBouncer as the local stand-in (2026-10-02). Transaction-local tenant context makes both safe
   (ADR-0023 amendment); RDS Proxy pinning is a B23 check.
3. **ADR-0020 vs audit R-03.** ADR-0020 has answer saves update `last_seen_at`; R-03 says answer
   writes never touch the parent attempt row. Settled in code: a post-commit, coalesced (15 s),
   conditional update outside the answer transaction (ADR-0020 amendment).
4. **ADR-0007 left "sample the event log?" to B21.** Decided: keep full logging (ADR-0007 amendment).
5. **DoD 1/4 at 1,000 attempts vs a single shared test host.** Steady state meets budget; the
   arrival ramp and submit wave do not on 4 shared vCPU. Owner decision (2026-10-03): document,
   size production from per-process costs, gate on the B23 staging re-run (§4).
6. **The roadmap says F20's client behaviour is part of what B21 measures**, but F20 is not built.
   The harness models the F13 client (batching, one flush in flight, sequence numbers, 30 s
   heartbeat). Two client requirements B21 found are carried to F20: back off on `503 Retry-After`
   (the web client has no handling today) and pre-cache paper media before the exam window.
7. **ADR-0021 (Start blocked until media cached) vs the 60 s lab-burst target** on a congested 2 Mbit
   link with a media-heavy paper — physically incompatible (§9). Settled operationally: pre-cache
   ahead of the window (F20, B23 guidance); not a server change.
8. **ADR-0032's region** met its own revisit condition — left to the owner at B23 (§9).
