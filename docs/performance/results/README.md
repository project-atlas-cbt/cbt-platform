# B21 run results — index and validity

Every file here is written by `tools/load` (markdown for reading, JSON with the full data). This
index records which runs are **valid evidence** and why some are not. Read it before quoting a
number from any individual report.

## Host memory: why many early runs are not evidence

The B21 workstation is an 8-thread i3-1215U with 7.7 GB RAM. On 2026-10-03 (~06:40 WAT) it was
measured at **0.16 GB free, 22.3 of 24.3 GB committed, ~27,600 pages/s** — the host was swapping,
with other applications holding most of the memory. Under those conditions request latency measures
the page file, not the platform. The harness now samples free host memory in every run and every
report carries a "Host memory pressure" banner when it fell below 500 MB.

| Run(s)                                                                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-10-02T22-10-27-levels-20-smoke`                                                                                                                | Harness smoke test (single API). Valid.                                                                                                                                                                                                                                                                                                                              |
| `2026-10-02T22-16-11-levels-100-baseline` vs `2026-10-02T22-57-48-levels-100-fix1-profile`                                                           | **Valid as a before/after pair** (same single-API topology, same host conditions, minutes apart): answer-save p95 1,088 → 334 ms, start p95 5.3 → 1.2 s, from the first round of fixes. Host memory was not yet monitored.                                                                                                                                           |
| `2026-10-02T22-22-05-levels-500-baseline`, `…22-33-22-levels-1000-baseline`                                                                          | Pre-fix baseline; show the collapse mode (pool starvation, 30 s timeouts). Latency **not** representative (host memory not monitored, later found paging).                                                                                                                                                                                                           |
| `2026-10-03T04-08-55-levels-500-3api-pgb`, `…04-19-30-levels-1000-3api-pgb`, `…04-46-02-levels-1000-fix2`, `…05-37-40-levels-1000-diag-async-commit` | **Not latency evidence** — three API processes on this host drove it into heavy paging (the last run recorded a 388 s start p95, longer than the harness's own 30 s request timeout: the harness itself was frozen). **Correctness evidence holds**: 0 duplicate attempts and **0 lost acknowledged answers** in every one (17,583 / 6,064 / 9,886 / 2,790 checked). |
| `2026-10-03T09-04-46-rtt-probe`                                                                                                                      | Valid — ADR-0032 RTT from this (Nigerian) network, machine idle.                                                                                                                                                                                                                                                                                                     |
| `2026-10-03T09-*-lab-burst-*`                                                                                                                        | Valid — one API process, after memory was freed (Docker VM capped at 2 GB; SQL Server, VS Code and browsers closed). The clean-link run dipped to 425 MB free once (flagged); it passed with wide margins.                                                                                                                                                           |

## Cloud runs (2026-10-03)

Completed in a Claude Code cloud session (project-owner decision, 2026-10-03): Intel Xeon @ 2.10 GHz,
4 vCPU, 15.7 GB RAM, disk fdatasync 4,113 ops/s, PostgreSQL 16 + PgBouncer 1.22 (transaction mode),
2 API processes and the worker — **and the load generator — on the same host**. Host memory never
fell below 10 GB free; no run is affected by paging. Each report records the environment.

| Run(s)                                                                                  | Status                                                                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `…09-43-25-levels-20-cloud`, `…09-55-49-levels-100-cloud`, `…10-08-14-levels-500-cloud` | **Valid.** All budgets met.                                                         |
| `…10-20-39-levels-1000-cloud`                                                           | **Valid.** Latency budgets missed (arrival ramp, submit wave), correctness exact.   |
| `…10-34-08-…-diag-series`, `…10-42-47-…-diag-profile`, `…10-46-44-…-diag-profile`       | Valid diagnostics (per-minute series; ramp CPU profile). Short sustain by design.   |
| `…10-51-10-levels-1000-cloud-ramp120`                                                   | **Valid.** Same 1,000 arrivals over 120 s.                                          |
| `…11-01-06-start-burst-cloud`, `…11-01-45-submit-burst-cloud`                           | **Valid.** Exact counts (DoD 2, 3); per-request p95 is queue depth.                 |
| `…11-06-00-levels-1000-cloud-endurance`                                                 | **Valid.** One hour; two unexplained stalls (capacity plan §13).                    |
| `…12-08-48-levels-1500-cloud-stress`, `…12-20-02-levels-2000-cloud-stress`              | **Valid** as stress: beyond this host's capacity by design.                         |
| `…12-34-52-shed-500-cloud-shed`, `…12-54-12-…-shed-examp95`                             | **Valid as the failure that led to the fix** — shedding did not engage.             |
| `…13-05-15-…-shed-elu`                                                                  | Valid. Shedding engaged; flood ignored `Retry-After` (hostile client).              |
| `…13-13-36-…-shed-elu-backoff`                                                          | **Valid — DoD 9 evidence.**                                                         |
| `…12-42-25-sse-500-cloud-sse`                                                           | **Valid — DoD 7 evidence.**                                                         |
| `…13-33-37-analytics-cloud`, `…13-37-27-…-participation-fix`                            | Valid as the before state of the analytics fixes (later samples in each were shed). |
| `…13-46-04-analytics-cloud-sql-aggregates`                                              | **Valid — DoD 10 evidence.**                                                        |

| `…13-47-24-levels-1000-cloud-endurance-diag` | **Not latency evidence** — an unidentified host process took up to 286 % CPU (13:55–14:00), the load generator stalled up to 5.9 s and its fixed-interval heartbeats stayed in lockstep afterwards. Correctness holds. |
| `…14-50-57-…-shed-final`, `…16-13-29-…-shed-final2`, `…16-22-…-shed-elu075`, `…16-32-…-shed-bulkhead`, `…16-42-…-shed-bulkhead-rate` | Valid as the defect hunt: shedding did not engage because the monitor never saw exam writes (`req.url` under middie). |
| `…15-01-06-levels-1000-cloud-dataset-open` | Valid control: the analytics dataset's 47 open exams do not affect steady state. |
| `…15-10-45-levels-1000-cloud-endurance-jitter` | **Valid — endurance evidence** (clean host, jittered heartbeats): whole hour p95 97 ms, p99 545 ms. |
| `…16-52-26-shed-500-cloud-shed-fixed` | **Valid — DoD 9 evidence on the final code.** |
| `…17-00-55-sse-500-cloud-sse-final` | **Valid — DoD 7 evidence on the final code** (60 streams, 0 refused, 0 errors). |
| `…17-08-22-levels-1000-cloud-final` | Valid regression on the final code: steady p95 51–78 ms; ramp-weighted p99 as DoD 1. |
