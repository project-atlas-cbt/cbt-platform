# B21 analytics on a realistic school dataset

**Scenario:** `analytics` · **Started:** 2026-10-03T13:33:37.114Z · **Duration:** 84s · **Budgets:** NOT met

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
| exam cold p95 | 1228.8 ms | ≤ 3000 ms | PASS |
| exam cached p95 | 61.57 ms | ≤ 300 ms | PASS |
| questions cold p95 | 300.8 ms | ≤ 3000 ms | PASS |
| questions cached p95 | 47.87 ms | ≤ 300 ms | PASS |
| class cold p95 | 428.29 ms | ≤ 3000 ms | PASS |
| class cached p95 | 34.27 ms | ≤ 300 ms | PASS |
| department cold p95 | 30031.87 ms | ≤ 3000 ms | FAIL |
| department cached p95 | 3211.26 ms | ≤ 300 ms | FAIL |
| school cold p95 | 30015.49 ms | ≤ 3000 ms | FAIL |
| school cached p95 | 2598.91 ms | ≤ 300 ms | FAIL |
| student cold p95 | 82.69 ms | ≤ 3000 ms | PASS |
| student cached p95 | 115.14 ms | ≤ 300 ms | PASS |
| analytics responses 200 | 41 non-200 | 0 | FAIL |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| analytics.class.cached | 10 | 10 | — | 0 | 27.52 | 34.27 | 34.27 | 34.27 |
| analytics.class.cold | 10 | 10 | — | 0 | 296.7 | 428.29 | 428.29 | 428.29 |
| analytics.department.cached | 1 | 1 | — | 0 | 3211.26 | 3211.26 | 3211.26 | 3211.26 |
| analytics.department.cold | 1 | 0 | — | 1 | 30031.87 | 30031.87 | 30031.87 | 30031.87 |
| analytics.exam.cached | 10 | 10 | — | 0 | 43.2 | 61.57 | 61.57 | 61.57 |
| analytics.exam.cold | 10 | 10 | — | 0 | 902.66 | 1228.8 | 1228.8 | 1228.8 |
| analytics.questions.cached | 10 | 10 | — | 0 | 40.35 | 47.87 | 47.87 | 47.87 |
| analytics.questions.cold | 10 | 10 | — | 0 | 249.6 | 300.8 | 300.8 | 300.8 |
| analytics.school.cached | 10 | 0 | 503×10 | 0 | 7.9 | 2598.91 | 2598.91 | 2598.91 |
| analytics.school.cold | 10 | 0 | 503×9 | 1 | 6.89 | 30015.49 | 30015.49 | 30015.49 |
| analytics.student.cached | 10 | 0 | 503×10 | 0 | 4.46 | 115.14 | 115.14 | 115.14 |
| analytics.student.cold | 10 | 0 | 503×10 | 0 | 6.32 | 82.69 | 82.69 | 82.69 |
| auth.login | 1 | 1 | — | 0 | 173.7 | 173.7 | 173.7 | 173.7 |
| tenant.resolve | 1 | 1 | — | 0 | 27.57 | 27.57 | 27.57 | 27.57 |

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
      "rows": 48938,
      "totalBytes": 26050560
    }
  ],
  "statuses": {
    "200": 61,
    "503": 39,
    "timeout": 2
  }
}
```

## Notes

- cold request timed out (30 s): department /analytics/departments/01a101ed-c71b-734a-abd9-d418c1b3e9c0
- cold request timed out (30 s): school /analytics/school
