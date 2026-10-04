# B22 chaos — Redis loses its data (FLUSHALL) with marking jobs queued

**Scenario:** `chaos-redis-data-loss` · **Started:** 2026-10-04T11:30:03.351Z · **Duration:** 212s · **Budgets:** all met

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
  "proves": "08 §25 cache outage (data loss); DoD 3, 4"
}
```

## Budget checks

| Check                                         | Actual                             | Budget         | Result |
| --------------------------------------------- | ---------------------------------- | -------------- | ------ |
| attempts created                              | 200                                | exactly 200    | PASS   |
| duplicate attempts                            | 0                                  | 0              | PASS   |
| results produced                              | 200                                | exactly 200    | PASS   |
| acknowledged answers lost                     | 0 of 2492                          | 0              | PASS   |
| attempts left IN_PROGRESS                     | 0                                  | 0              | PASS   |
| attempts without a result                     | 0                                  | 0              | PASS   |
| results not FINAL                             | 0                                  | 0              | PASS   |
| results with a question unmarked              | 0                                  | 0              | PASS   |
| results whose total ≠ sum of question marks   | 0                                  | 0              | PASS   |
| answer rows without their accepted event      | 0                                  | 0              | PASS   |
| finalisation audited exactly once per attempt | 200 audits / 200 attempts, 0 twice | equal, 0 twice | PASS   |
| marking jobs left failed                      | 0                                  | 0              | PASS   |
| marking drained                               | 136.5 s                            | within 420 s   | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | ---- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 2583  | 2583 | —              | 0        | 16.93   | 263.94  | 387.58  | 885.25  |
| attempt.heartbeat  | 429   | 429  | —              | 0        | 16.58   | 303.1   | 440.32  | 587.26  |
| attempt.start      | 200   | 200  | —              | 0        | 845.82  | 1212.42 | 1321.98 | 1373.18 |
| attempt.submit     | 200   | 200  | —              | 0        | 1062.91 | 1160.19 | 1173.5  | 1175.55 |
| auth.login         | 204   | 204  | —              | 0        | 440.32  | 816.64  | 899.58  | 935.42  |
| session.open       | 4     | 4    | —              | 0        | 318.72  | 368.9   | 368.9   | 368.9   |
| student.assessment | 200   | 200  | —              | 0        | 310.78  | 447.49  | 526.34  | 543.23  |
| student.preview    | 200   | 200  | —              | 0        | 338.18  | 441.09  | 492.8   | 571.9   |
| tenant.resolve     | 204   | 204  | —              | 0        | 100.16  | 223.1   | 267.26  | 277.5   |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States       | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------ | ------- | ----- | --------------- | --------------- |
| 01a106ad | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 669             | 0               |
| 01a106ad | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 602             | 0               |
| 01a106ad | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 600             | 0               |
| 01a106ad | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 621             | 0               |

## Additional measurements

```json
{
  "timeline": [
    {
      "t": 14.2,
      "event": "200 students answering"
    },
    {
      "t": 74.2,
      "event": "SIGSTOP worker"
    },
    {
      "t": 75.4,
      "event": "FLUSHALL"
    },
    {
      "t": 75.4,
      "event": "SIGCONT worker"
    },
    {
      "t": 211.8,
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
