# B22 chaos — Object storage unresponsive (SIGSTOP 30 s) mid-exam

**Scenario:** `chaos-storage-hang` · **Started:** 2026-10-04T11:24:48.602Z · **Duration:** 106s · **Budgets:** all met

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
  "proves": "08 §25 object-storage outage; DoD 5"
}
```

## Budget checks

| Check                                         | Actual                             | Budget         | Result |
| --------------------------------------------- | ---------------------------------- | -------------- | ------ |
| attempts created                              | 200                                | exactly 200    | PASS   |
| duplicate attempts                            | 0                                  | 0              | PASS   |
| results produced                              | 200                                | exactly 200    | PASS   |
| acknowledged answers lost                     | 0 of 3506                          | 0              | PASS   |
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

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | ---- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 3959  | 3959 | —              | 0        | 14.42   | 33.12   | 237.82  | 339.2   |
| attempt.heartbeat  | 634   | 634  | —              | 0        | 14.31   | 32.18   | 286.98  | 379.14  |
| attempt.start      | 200   | 200  | —              | 0        | 654.34  | 801.28  | 855.04  | 879.1   |
| attempt.submit     | 200   | 200  | —              | 0        | 1302.53 | 1439.74 | 1447.94 | 1453.06 |
| auth.login         | 204   | 204  | —              | 0        | 329.47  | 529.92  | 586.75  | 641.02  |
| session.open       | 4     | 4    | —              | 0        | 197.76  | 273.41  | 273.41  | 273.41  |
| student.assessment | 200   | 200  | —              | 0        | 211.84  | 299.78  | 329.47  | 381.95  |
| student.preview    | 200   | 200  | —              | 0        | 227.71  | 291.84  | 370.18  | 381.44  |
| tenant.resolve     | 204   | 204  | —              | 0        | 69.95   | 125.25  | 151.04  | 183.04  |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States       | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------ | ------- | ----- | --------------- | --------------- |
| 01a106a8 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 880             | 0               |
| 01a106a8 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 870             | 0               |
| 01a106a8 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 885             | 0               |
| 01a106a8 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 50    | 871             | 0               |

## Additional measurements

```json
{
  "timeline": [
    {
      "t": 9.6,
      "event": "200 students answering"
    },
    {
      "t": 39.6,
      "event": "SIGSTOP storage"
    },
    {
      "t": 71.6,
      "event": "SIGCONT storage"
    },
    {
      "t": 103,
      "event": "all submitted"
    },
    {
      "t": 106.1,
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

- Readiness during the storage outage: 200 {"status":"degraded","checks":[{"name":"database","ok":true,"critical":true},{"name":"redis","ok":true,"critical":false},{"name":"storage","ok":false,"critical":false}]}
- Answer batches that failed during the fault and were retried: 0. Answer-save success over the run: 100.00 % (a fault row is not held to the 99.9 % steady-state budget — the integrity checks are the pass condition).
