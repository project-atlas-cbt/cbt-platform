# B21 analytics on a realistic school dataset

**Scenario:** `analytics` · **Started:** 2026-10-03T13:46:04.988Z · **Duration:** 45s · **Budgets:** all met

## Environment

| Key         | Value                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| host        | vm                                                                                   |
| platform    | linux 6.18.44-fc-v64                                                                 |
| cpu         | Intel(R) Xeon(R) Processor @ 2.10GHz                                                 |
| logicalCpus | 4                                                                                    |
| memoryGb    | 15.7                                                                                 |
| node        | v22.22.0                                                                             |
| network     | clean (loopback)                                                                     |
| pooler      | PgBouncer 1.22 transaction mode (default_pool_size 40, max_db_connections 60)        |
| diskFsync   | fdatasync 4,113 ops/s (243 µs/op), pg_test_fsync                                     |
| database    | PostgreSQL 16.14 + uuidv7 shim, max_connections 100, shared_buffers 128MB, same host |

## Parameters

```json
{
  "exams": 47,
  "largestExamResults": 1160,
  "results": 53680,
  "attemptQuestionResults": 2147200,
  "attempts": 53680,
  "classes": 30,
  "samplesPerEndpoint": 10
}
```

## Budget checks

| Check                   | Actual     | Budget    | Result |
| ----------------------- | ---------- | --------- | ------ |
| exam cold p95           | 1261.57 ms | ≤ 3000 ms | PASS   |
| exam cached p95         | 72.83 ms   | ≤ 300 ms  | PASS   |
| questions cold p95      | 419.58 ms  | ≤ 3000 ms | PASS   |
| questions cached p95    | 60.61 ms   | ≤ 300 ms  | PASS   |
| class cold p95          | 439.3 ms   | ≤ 3000 ms | PASS   |
| class cached p95        | 47.68 ms   | ≤ 300 ms  | PASS   |
| department cold p95     | 1536 ms    | ≤ 3000 ms | PASS   |
| department cached p95   | 22.26 ms   | ≤ 300 ms  | PASS   |
| school cold p95         | 2508.8 ms  | ≤ 3000 ms | PASS   |
| school cached p95       | 21.58 ms   | ≤ 300 ms  | PASS   |
| student cold p95        | 103.42 ms  | ≤ 3000 ms | PASS   |
| student cached p95      | 56.48 ms   | ≤ 300 ms  | PASS   |
| analytics responses 200 | 0 non-200  | 0         | PASS   |

## Latency by operation (client-observed)

| Operation                   | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms  | p99 ms  | max ms  |
| --------------------------- | ----- | --- | -------------- | -------- | ------ | ------- | ------- | ------- |
| analytics.class.cached      | 10    | 10  | —              | 0        | 30.93  | 47.68   | 47.68   | 47.68   |
| analytics.class.cold        | 10    | 10  | —              | 0        | 376.06 | 439.3   | 439.3   | 439.3   |
| analytics.department.cached | 1     | 1   | —              | 0        | 22.26  | 22.26   | 22.26   | 22.26   |
| analytics.department.cold   | 1     | 1   | —              | 0        | 1536   | 1536    | 1536    | 1536    |
| analytics.exam.cached       | 10    | 10  | —              | 0        | 51.01  | 72.83   | 72.83   | 72.83   |
| analytics.exam.cold         | 10    | 10  | —              | 0        | 947.71 | 1261.57 | 1261.57 | 1261.57 |
| analytics.questions.cached  | 10    | 10  | —              | 0        | 39.71  | 60.61   | 60.61   | 60.61   |
| analytics.questions.cold    | 10    | 10  | —              | 0        | 308.74 | 419.58  | 419.58  | 419.58  |
| analytics.school.cached     | 10    | 10  | —              | 0        | 17.09  | 21.58   | 21.58   | 21.58   |
| analytics.school.cold       | 10    | 10  | —              | 0        | 2351.1 | 2508.8  | 2508.8  | 2508.8  |
| analytics.student.cached    | 10    | 10  | —              | 0        | 50.59  | 56.48   | 56.48   | 56.48   |
| analytics.student.cold      | 10    | 10  | —              | 0        | 78.27  | 103.42  | 103.42  | 103.42  |
| auth.login                  | 1     | 1   | —              | 0        | 95.81  | 95.81   | 95.81   | 95.81   |
| tenant.resolve              | 1     | 1   | —              | 0        | 21.12  | 21.12   | 21.12   | 21.12   |

## Additional measurements

```json
{
  "tableSizesAfter": [
    {
      "table": "exam_attempts",
      "rows": 66934,
      "totalBytes": 53215232
    },
    {
      "table": "attempt_question_snapshots",
      "rows": 66934,
      "totalBytes": 710418432
    },
    {
      "table": "attempt_answers",
      "rows": 2452046,
      "totalBytes": 721870848
    },
    {
      "table": "attempt_answer_events",
      "rows": 769468,
      "totalBytes": 186998784
    },
    {
      "table": "attempt_question_results",
      "rows": 2677360,
      "totalBytes": 744718336
    },
    {
      "table": "attempt_events",
      "rows": 38148,
      "totalBytes": 7749632
    },
    {
      "table": "results",
      "rows": 66934,
      "totalBytes": 28377088
    },
    {
      "table": "exam_session_participants",
      "rows": 86100,
      "totalBytes": 25550848
    },
    {
      "table": "exam_participations",
      "rows": 69654,
      "totalBytes": 21233664
    },
    {
      "table": "audit_events",
      "rows": 48946,
      "totalBytes": 26058752
    }
  ],
  "statuses": {
    "200": 102
  }
}
```
