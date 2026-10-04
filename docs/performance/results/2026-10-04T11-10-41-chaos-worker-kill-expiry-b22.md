# B22 chaos — Exam time runs out while the worker is down (auto-submit sweeper)

**Scenario:** `chaos-worker-kill-expiry` · **Started:** 2026-10-04T11:10:41.232Z · **Duration:** 206s · **Budgets:** all met

## Environment

| Key         | Value                                |
| ----------- | ------------------------------------ |
| host        | vm                                   |
| platform    | linux 6.18.44-fc-v64                 |
| cpu         | Intel(R) Xeon(R) Processor @ 2.10GHz |
| logicalCpus | 4                                    |
| memoryGb    | 15.7                                 |
| node        | v22.22.0                             |
| network     | clean (loopback)                     |
| pooler      | none (direct)                        |

## Parameters

```json
{
  "students": 200,
  "schools": 4,
  "questions": 20,
  "apiProcesses": 2,
  "proves": "08 §25 worker crash; ADR-0004; DoD 3"
}
```

## Budget checks

| Check                                         | Actual                             | Budget         | Result |
| --------------------------------------------- | ---------------------------------- | -------------- | ------ |
| attempts created                              | 200                                | exactly 200    | PASS   |
| duplicate attempts                            | 0                                  | 0              | PASS   |
| results produced                              | 200                                | exactly 200    | PASS   |
| acknowledged answers lost                     | 0 of 3999                          | 0              | PASS   |
| attempts left IN_PROGRESS                     | 0                                  | 0              | PASS   |
| attempts without a result                     | 0                                  | 0              | PASS   |
| results not FINAL                             | 0                                  | 0              | PASS   |
| results with a question unmarked              | 0                                  | 0              | PASS   |
| results whose total ≠ sum of question marks   | 0                                  | 0              | PASS   |
| answer rows without their accepted event      | 0                                  | 0              | PASS   |
| finalisation audited exactly once per attempt | 200 audits / 200 attempts, 0 twice | equal, 0 twice | PASS   |
| marking jobs left failed                      | 0                                  | 0              | PASS   |
| marking drained                               | 6.1 s                              | within 300 s   | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| ------------------ | ----- | ---- | -------------- | -------- | ------ | ------ | ------ | ------ |
| answer.batch       | 7640  | 7640 | —              | 0        | 14.23  | 26.3   | 227.07 | 410.37 |
| attempt.heartbeat  | 1292  | 1292 | —              | 0        | 13.99  | 24.13  | 209.66 | 460.03 |
| attempt.start      | 200   | 200  | —              | 0        | 596.99 | 877.57 | 985.6  | 998.91 |
| auth.login         | 204   | 204  | —              | 0        | 379.39 | 590.85 | 660.99 | 698.88 |
| session.open       | 4     | 4    | —              | 0        | 226.3  | 320    | 320    | 320    |
| student.assessment | 200   | 200  | —              | 0        | 220.29 | 384.51 | 421.89 | 452.61 |
| student.preview    | 200   | 200  | —              | 0        | 230.78 | 363.52 | 428.54 | 435.46 |
| tenant.resolve     | 204   | 204  | —              | 0        | 62.43  | 146.43 | 193.92 | 212.35 |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States            | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ----------------- | ------- | ----- | --------------- | --------------- |
| 01a1069b | 50       | 50       | 50                | 0          | AUTO_SUBMITTED:50 | 50      | 50    | 1000            | 0               |
| 01a1069b | 50       | 50       | 50                | 0          | AUTO_SUBMITTED:50 | 50      | 50    | 999             | 0               |
| 01a1069b | 50       | 50       | 50                | 0          | AUTO_SUBMITTED:50 | 50      | 50    | 1000            | 0               |
| 01a1069b | 50       | 50       | 50                | 0          | AUTO_SUBMITTED:50 | 50      | 50    | 1000            | 0               |

## Additional measurements

```json
{
  "timeline": [
    {
      "t": 10.2,
      "event": "200 students answering"
    },
    {
      "t": 90.2,
      "event": "SIGKILL worker"
    },
    {
      "t": 200.3,
      "event": "worker back"
    },
    {
      "t": 206.3,
      "event": "marking drained"
    }
  ],
  "integrity": [
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 0,
      "resultsIncomplete": 0,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 0,
      "resultsIncomplete": 0,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 0,
      "resultsIncomplete": 0,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 0,
      "resultsIncomplete": 0,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    }
  ]
}
```

## Notes

- Answer batches that failed during the fault and were retried: 0. Answer-save success over the run: 100.00 % (a fault row is not held to the 99.9 % steady-state budget — the integrity checks are the pass condition).
