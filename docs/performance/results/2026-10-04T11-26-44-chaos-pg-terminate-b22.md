# B22 chaos — Every application database connection killed, twice, mid-exam

**Scenario:** `chaos-pg-terminate` · **Started:** 2026-10-04T11:26:44.723Z · **Duration:** 90s · **Budgets:** all met

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
  "proves": "08 §25 transient database failure"
}
```

## Budget checks

| Check                                         | Actual                             | Budget         | Result |
| --------------------------------------------- | ---------------------------------- | -------------- | ------ |
| attempts created                              | 200                                | exactly 200    | PASS   |
| duplicate attempts                            | 0                                  | 0              | PASS   |
| results produced                              | 200                                | exactly 200    | PASS   |
| acknowledged answers lost                     | 0 of 3028                          | 0              | PASS   |
| attempts left IN_PROGRESS                     | 0                                  | 0              | PASS   |
| attempts without a result                     | 0                                  | 0              | PASS   |
| results not FINAL                             | 0                                  | 0              | PASS   |
| results with a question unmarked              | 0                                  | 0              | PASS   |
| results whose total ≠ sum of question marks   | 0                                  | 0              | PASS   |
| answer rows without their accepted event      | 0                                  | 0              | PASS   |
| finalisation audited exactly once per attempt | 200 audits / 200 attempts, 0 twice | equal, 0 twice | PASS   |
| marking jobs left failed                      | 0                                  | 0              | PASS   |
| marking drained                               | 3.1 s                              | within 180 s   | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms  | p95 ms | p99 ms  | max ms  |
| ------------------ | ----- | ---- | -------------- | -------- | ------- | ------ | ------- | ------- |
| answer.batch       | 3277  | 3275 | 503×2          | 0        | 15.18   | 46.5   | 319.49  | 1136.64 |
| attempt.heartbeat  | 533   | 533  | —              | 0        | 14.98   | 28.59  | 428.03  | 468.99  |
| attempt.start      | 200   | 200  | —              | 0        | 423.17  | 970.24 | 1041.92 | 1124.35 |
| attempt.submit     | 200   | 200  | —              | 0        | 1426.43 | 1638.4 | 1651.71 | 1656.83 |
| auth.login         | 204   | 204  | —              | 0        | 279.04  | 638.98 | 696.32  | 758.78  |
| session.open       | 4     | 4    | —              | 0        | 202.88  | 227.2  | 227.2   | 227.2   |
| student.assessment | 200   | 200  | —              | 0        | 154.88  | 424.96 | 470.27  | 480     |
| student.preview    | 200   | 200  | —              | 0        | 178.82  | 403.2  | 436.48  | 448.26  |
| tenant.resolve     | 204   | 204  | —              | 0        | 34.18   | 170.62 | 191.62  | 249.73  |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States       | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------ | ------- | ----- | --------------- | --------------- |
| 01a106aa | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 766             | 0               |
| 01a106aa | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 752             | 0               |
| 01a106aa | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 733             | 0               |
| 01a106aa | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 777             | 0               |

## Additional measurements

```json
{
  "timeline": [
    {
      "t": 9.1,
      "event": "200 students answering"
    },
    {
      "t": 39.1,
      "event": "pg_terminate_backend ×25 (1)"
    },
    {
      "t": 47.1,
      "event": "pg_terminate_backend ×8 (2)"
    },
    {
      "t": 86.8,
      "event": "all submitted"
    },
    {
      "t": 89.8,
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

- Answer batches that failed during the fault and were retried: 2. Answer-save success over the run: 99.94 % (a fault row is not held to the 99.9 % steady-state budget — the integrity checks are the pass condition).
