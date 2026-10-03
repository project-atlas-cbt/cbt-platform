# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T15:01:06.588Z · **Duration:** 448s · **Budgets:** NOT met

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
  "level": 1000,
  "schools": 5,
  "questions": 40,
  "mediaKbPerQuestion": 0,
  "rampSeconds": 60,
  "sustainSeconds": 300,
  "submitSpreadSeconds": 60,
  "answerIntervalMs": 10000,
  "heartbeatMs": 30000,
  "apiProcesses": 2,
  "sseClients": 0,
  "reportingFlood": 0,
  "floodHostile": false,
  "offeredAnswerChangesPerSecond": 100
}
```

## Budget checks

| Check | Actual | Budget | Result |
| --- | --- | --- | --- |
| starts failed | 0 | 0 | PASS |
| answer save p95 | 1155.07 ms | ≤ 250 ms | FAIL |
| answer save p99 | 2410.5 ms | ≤ 750 ms | FAIL |
| answer save success | 100.000% | ≥ 99.9% | PASS |
| start p95 | 5660.67 ms | ≤ 2000 ms | FAIL |
| submit p95 | 1157.12 ms | ≤ 2000 ms | PASS |
| submits accepted | 1000/1000 | 1000 | PASS |
| attempts created | 1000 | exactly 1000 | PASS |
| duplicate attempts | 0 | 0 | PASS |
| results produced | 1000 | exactly 1000 | PASS |
| acknowledged answers lost | 0 of 34459 | 0 | PASS |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| answer.batch | 37338 | 37338 | — | 0 | 29.62 | 1155.07 | 2410.5 | 2807.81 |
| attempt.event | 1498 | 1498 | — | 0 | 22.32 | 74.94 | 143.23 | 272.38 |
| attempt.heartbeat | 12363 | 12363 | — | 0 | 29.74 | 1613.82 | 3008.51 | 3430.4 |
| attempt.start | 1000 | 1000 | — | 0 | 868.86 | 5660.67 | 6103.04 | 6340.61 |
| attempt.status | 1000 | 1000 | — | 0 | 3854.34 | 4151.3 | 4190.21 | 4198.4 |
| attempt.submit | 1000 | 1000 | — | 0 | 52.45 | 1157.12 | 1435.65 | 1513.47 |
| auth.login | 1005 | 1005 | — | 0 | 342.78 | 4128.77 | 4542.46 | 4628.48 |
| session.open | 5 | 5 | — | 0 | 993.79 | 1034.75 | 1034.75 | 1034.75 |
| student.assessment | 1000 | 1000 | — | 0 | 273.92 | 2820.1 | 3020.8 | 3168.26 |
| student.preview | 1000 | 1000 | — | 0 | 277.5 | 1847.3 | 2083.84 | 2222.08 |
| tenant.resolve | 1005 | 1005 | — | 0 | 71.49 | 910.85 | 1124.35 | 1164.29 |

## Server resources (sampled every 5 s)

| Metric | Value |
| --- | --- |
| samples | 90 |
| peakConnections | 45 |
| peakActive | 5 |
| peakIdleInTransaction | 37 |
| peakWaitingLocks | 0 |
| avgCommitsPerSecond | 609 |
| peakCommitsPerSecond | 817 |
| peakRedisClients | 75 |
| peakRedisMemoryMb | 232 |
| minHostFreeMemoryMb | 13268 |
| hostMemoryPressure | false |
| peakHarnessLoopDelayMs | 123 |
| harnessStalls |  |

## Correctness verification (database)

| Exam | Expected | Attempts | Distinct students | Duplicates | States | Results | Final | Answers checked | Lost/mismatched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01a10248 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 7302 | 0 |
| 01a10248 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 7096 | 0 |
| 01a10248 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 6888 | 0 |
| 01a10248 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 6840 | 0 |
| 01a10248 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 6333 | 0 |

## Storage growth (1000 attempts)

| Table | Rows added | Bytes added | Bytes / attempt |
| --- | --- | --- | --- |
| exam_attempts | 1000 | 1056768 | 1057 |
| attempt_question_snapshots | 1000 | 10936320 | 10936 |
| attempt_answers | 34459 | 10428416 | 10428 |
| attempt_answer_events | 37780 | 10829824 | 10830 |
| attempt_question_results | 40000 | 11468800 | 11469 |
| attempt_events | 1498 | 622592 | 623 |
| results | 1000 | 794624 | 795 |
| exam_session_participants | 1500 | 434176 | 434 |
| exam_participations | 1000 | 573440 | 573 |
| audit_events | 3035 | 1277952 | 1278 |

## Drift over time (per minute)

### answer.batch

| Minute | Count | p95 ms | p99 ms |
| --- | --- | --- | --- |
| 0 | 2331 | 1225.73 | 1385.47 |
| 1 | 5696 | 2455.55 | 2652.16 |
| 2 | 5896 | 87.55 | 163.97 |
| 3 | 6038 | 100.93 | 159.1 |
| 4 | 6056 | 75.39 | 132.48 |
| 5 | 6045 | 92.48 | 173.06 |
| 6 | 4819 | 742.4 | 973.31 |
| 7 | 457 | 58.11 | 71.17 |

### attempt.heartbeat

| Minute | Count | p95 ms | p99 ms |
| --- | --- | --- | --- |
| 0 | 689 | 1528.83 | 1657.86 |
| 1 | 1937 | 3090.43 | 3303.42 |
| 2 | 2000 | 83.9 | 165.89 |
| 3 | 2000 | 107.97 | 151.81 |
| 4 | 1998 | 77.25 | 127.74 |
| 5 | 2002 | 92.16 | 146.43 |
| 6 | 1591 | 946.18 | 1205.25 |
| 7 | 146 | 62.91 | 72.7 |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query |
| --- | --- | --- | --- |
| 37780 | 8530 | 0.226 | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 40000 | 6115 | 0.153 | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 37780 | 5300 | 0.14 | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 5 | 2036 | 407.268 | `SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number FROM attempt_answers WHERE attempt_id = ANY($1::uuid[])` |
| 1000 | 1632 | 1.632 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."exam_session_id", "public"."exam_session_participants"."school_id" FROM ` |
| 56199 | 1604 | 0.029 | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 2281 | 1465 | 0.642 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."state"::text FROM "public"."exam_attempts" WHERE ` |
| 2281 | 1451 | 0.636 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 56199 | 1433 | 0.026 | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 56199 | 1402 | 0.025 | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 57199 | 1369 | 0.024 | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 390 | 1344 | 3.447 | `SELECT "public"."exam_attempts"."id" FROM "public"."exam_attempts" WHERE ("public"."exam_attempts"."school_id" = $1 AND "public"."exam_attempts"."state" = CAST(` |
| 207473 | 1263 | 0.006 | `SELECT set_config($1, $2, $3)` |
| 2281 | 1218 | 0.534 | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa` |
| 2281 | 1158 | 0.508 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state` |

## Additional measurements

```json
{
  "sessionOpenMs": [
    987,
    1025,
    884,
    994,
    1035
  ],
  "markingDrainSeconds": 4.2,
  "studentsSawResult": "1000/1000"
}
```
