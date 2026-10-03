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

The 500/1,000-level, burst, endurance and stress runs are being completed in a Claude Code cloud
session (project-owner decision, 2026-10-03), where the host is not shared with other applications.
Their reports will land here with the host's measured CPU, memory and disk fsync rate.
