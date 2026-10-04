# B22 chaos — Redis loses its data (FLUSHALL) with marking jobs queued

**Scenario:** `chaos-redis-data-loss` · **Started:** 2026-10-04T11:16:27.254Z · **Duration:** 491s · **Budgets:** NOT met

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
| results produced                              | 0                                  | exactly 200    | FAIL   |
| acknowledged answers lost                     | 0 of 2533                          | 0              | PASS   |
| attempts left IN_PROGRESS                     | 0                                  | 0              | PASS   |
| attempts without a result                     | 0                                  | 0              | PASS   |
| results not FINAL                             | 200                                | 0              | FAIL   |
| results with a question unmarked              | 200                                | 0              | FAIL   |
| results whose total ≠ sum of question marks   | 0                                  | 0              | PASS   |
| answer rows without their accepted event      | 0                                  | 0              | PASS   |
| finalisation audited exactly once per attempt | 200 audits / 200 attempts, 0 twice | equal, 0 twice | PASS   |
| marking jobs left failed                      | 0                                  | 0              | PASS   |
| marking drained                               | timed out                          | within 420 s   | FAIL   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms  |
| ------------------ | ----- | ---- | -------------- | -------- | ------ | ------ | ------ | ------- |
| answer.batch       | 2646  | 2646 | —              | 0        | 14.86  | 153.47 | 321.54 | 413.7   |
| attempt.heartbeat  | 426   | 426  | —              | 0        | 14.46  | 135.55 | 370.69 | 444.42  |
| attempt.start      | 200   | 200  | —              | 0        | 610.3  | 996.86 | 1071.1 | 1099.78 |
| attempt.submit     | 200   | 200  | —              | 0        | 846.85 | 972.29 | 982.02 | 986.11  |
| auth.login         | 204   | 204  | —              | 0        | 372.22 | 661.5  | 719.36 | 775.17  |
| session.open       | 4     | 4    | —              | 0        | 197.38 | 225.28 | 225.28 | 225.28  |
| student.assessment | 200   | 200  | —              | 0        | 207.23 | 399.62 | 456.19 | 464.38  |
| student.preview    | 200   | 200  | —              | 0        | 228.1  | 369.92 | 403.97 | 437.5   |
| tenant.resolve     | 204   | 204  | —              | 0        | 65.15  | 161.66 | 214.27 | 237.7   |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States       | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------ | ------- | ----- | --------------- | --------------- |
| 01a106a1 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 0     | 650             | 0               |
| 01a106a1 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 0     | 639             | 0               |
| 01a106a1 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 0     | 640             | 0               |
| 01a106a1 | 50       | 50       | 50                | 0          | SUBMITTED:50 | 50      | 0     | 604             | 0               |

## Additional measurements

```json
{
  "timeline": [
    {
      "t": 10.1,
      "event": "200 students answering"
    },
    {
      "t": 70.1,
      "event": "SIGSTOP worker"
    },
    {
      "t": 71.1,
      "event": "FLUSHALL"
    },
    {
      "t": 71.1,
      "event": "SIGCONT worker"
    },
    {
      "t": 491.3,
      "event": "marking timed out"
    }
  ],
  "integrity": [
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 50,
      "resultsIncomplete": 50,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 50,
      "resultsIncomplete": 50,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 50,
      "resultsIncomplete": 50,
      "totalsWrong": 0,
      "answersWithoutEvent": 0,
      "finalisationAudits": 50,
      "attemptsAuditedTwice": 0
    },
    {
      "attempts": 50,
      "inProgress": 0,
      "attemptsWithoutResult": 0,
      "resultsNotFinal": 50,
      "resultsIncomplete": 50,
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
