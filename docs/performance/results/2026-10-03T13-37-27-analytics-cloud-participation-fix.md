# B21 analytics on a realistic school dataset

**Scenario:** `analytics` · **Started:** 2026-10-03T13:37:27.530Z · **Duration:** 23s · **Budgets:** NOT met

## Environment

| Key | Value |
| --- | --- |
| host | vm |
| platform | linux 6.18.44-fc-v64 |
| cpu | Intel(R) Xeon(R) Processor @ 2.10GHz |
| logicalCpus | 4 |
| memoryGb | 15.7 |
| node | v22.22.0 |
| network | clean (loopback) |
| pooler | PgBouncer 1.22 transaction mode (default_pool_size 40, max_db_connections 60) |
| diskFsync | fdatasync 4,113 ops/s (243 µs/op), pg_test_fsync |
| database | PostgreSQL 16.14 + uuidv7 shim, max_connections 100, shared_buffers 128MB, same host |

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

| Check | Actual | Budget | Result |
| --- | --- | --- | --- |
| exam cold p95 | 995.84 ms | ≤ 3000 ms | PASS |
| exam cached p95 | 56.99 ms | ≤ 300 ms | PASS |
| questions cold p95 | 281.6 ms | ≤ 3000 ms | PASS |
| questions cached p95 | 45.95 ms | ≤ 300 ms | PASS |
| class cold p95 | 347.39 ms | ≤ 3000 ms | PASS |
| class cached p95 | 32.05 ms | ≤ 300 ms | PASS |
| department cold p95 | 2086.91 ms | ≤ 3000 ms | PASS |
| department cached p95 | 24.88 ms | ≤ 300 ms | PASS |
| school cold p95 | 3123.2 ms | ≤ 3000 ms | FAIL |
| school cached p95 | 26.72 ms | ≤ 300 ms | PASS |
| student cold p95 | 5.74 ms | ≤ 3000 ms | PASS |
| student cached p95 | 3.73 ms | ≤ 300 ms | PASS |
| analytics responses 200 | 37 non-200 | 0 | FAIL |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| analytics.class.cached | 10 | 10 | — | 0 | 26.02 | 32.05 | 32.05 | 32.05 |
| analytics.class.cold | 10 | 10 | — | 0 | 290.05 | 347.39 | 347.39 | 347.39 |
| analytics.department.cached | 1 | 1 | — | 0 | 24.88 | 24.88 | 24.88 | 24.88 |
| analytics.department.cold | 1 | 1 | — | 0 | 2086.91 | 2086.91 | 2086.91 | 2086.91 |
| analytics.exam.cached | 10 | 10 | — | 0 | 35.01 | 56.99 | 56.99 | 56.99 |
| analytics.exam.cold | 10 | 10 | — | 0 | 686.08 | 995.84 | 995.84 | 995.84 |
| analytics.questions.cached | 10 | 10 | — | 0 | 32.77 | 45.95 | 45.95 | 45.95 |
| analytics.questions.cold | 10 | 10 | — | 0 | 218.37 | 281.6 | 281.6 | 281.6 |
| analytics.school.cached | 10 | 1 | 503×9 | 0 | 3.67 | 26.72 | 26.72 | 26.72 |
| analytics.school.cold | 10 | 2 | 503×8 | 0 | 3.15 | 3123.2 | 3123.2 | 3123.2 |
| analytics.student.cached | 10 | 0 | 503×10 | 0 | 2.92 | 3.73 | 3.73 | 3.73 |
| analytics.student.cold | 10 | 0 | 503×10 | 0 | 2.97 | 5.74 | 5.74 | 5.74 |
| auth.login | 1 | 1 | — | 0 | 164.35 | 164.35 | 164.35 | 164.35 |
| tenant.resolve | 1 | 1 | — | 0 | 20.42 | 20.42 | 20.42 | 20.42 |

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
      "rows": 48939,
      "totalBytes": 26058752
    }
  ],
  "statuses": {
    "200": 65,
    "503": 37
  }
}
```
