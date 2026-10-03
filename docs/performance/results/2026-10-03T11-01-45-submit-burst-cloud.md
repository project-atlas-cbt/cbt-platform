# B21 500 simultaneous submissions

**Scenario:** `submit-burst` · **Started:** 2026-10-03T11:01:45.428Z · **Duration:** 49s · **Budgets:** NOT met

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
  "n": 500,
  "schools": 5,
  "questions": 40,
  "apiProcesses": 2
}
```

## Budget checks

| Check | Actual | Budget | Result |
| --- | --- | --- | --- |
| submit requests answered 200 | 500/500 | 500 | PASS |
| burst wall time | 7.7 s | ≤ 60 s | PASS |
| submit p95 | 4931.58 ms | ≤ 2000 ms | FAIL |
| attempts created | 500 | exactly 500 | PASS |
| duplicate attempts | 0 | 0 | PASS |
| results produced | 500 | exactly 500 | PASS |
| acknowledged answers lost | 0 of 2485 | 0 | PASS |
| marking drained (all results FINAL) | 10.1 s | within 600 s | PASS |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| answer.batch | 1000 | 1000 | — | 0 | 643.07 | 3665.92 | 3999.74 | 4116.48 |
| attempt.start | 500 | 500 | — | 0 | 761.86 | 1324.03 | 1557.5 | 1628.16 |
| attempt.submit | 500 | 500 | — | 0 | 3995.65 | 4931.58 | 5132.29 | 5152.77 |
| auth.login | 505 | 505 | — | 0 | 278.27 | 457.47 | 662.02 | 754.69 |
| session.open | 5 | 5 | — | 0 | 1170.43 | 1217.54 | 1217.54 | 1217.54 |
| student.assessment | 500 | 500 | — | 0 | 163.58 | 225.92 | 242.94 | 259.97 |
| student.preview | 500 | 500 | — | 0 | 238.72 | 313.6 | 360.96 | 403.2 |
| tenant.resolve | 505 | 505 | — | 0 | 51.23 | 83.2 | 96.45 | 110.4 |

## Server resources (sampled every 5 s)

| Metric | Value |
| --- | --- |
| samples | 10 |
| peakConnections | 46 |
| peakActive | 4 |
| peakIdleInTransaction | 36 |
| peakWaitingLocks | 0 |
| avgCommitsPerSecond | 489 |
| peakCommitsPerSecond | 878 |
| peakRedisClients | 75 |
| peakRedisMemoryMb | 155.1 |
| minHostFreeMemoryMb | 12272 |
| hostMemoryPressure | false |

## Correctness verification (database)

| Exam | Expected | Attempts | Distinct students | Duplicates | States | Results | Final | Answers checked | Lost/mismatched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01a1016d | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 496 | 0 |
| 01a1016d | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 496 | 0 |
| 01a1016d | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 499 | 0 |
| 01a1016d | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 496 | 0 |
| 01a1016d | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 498 | 0 |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query |
| --- | --- | --- | --- |
| 20000 | 2649 | 0.132 | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 2494 | 629 | 0.252 | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 500 | 561 | 1.121 | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 2494 | 463 | 0.186 | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 500 | 292 | 0.585 | `INSERT INTO "public"."results" ("school_id","attempt_id","exam_id","student_profile_id","state","total_marks","earned_marks","percentage","correct_count","incor` |
| 500 | 245 | 0.489 | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 1000 | 226 | 0.226 | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","occurred_at") VALUES ($1,$2,CAST` |
| 500 | 215 | 0.431 | `SELECT "public"."question_options"."id", "public"."question_options"."school_id", "public"."question_options"."question_revision_id", "public"."question_options` |
| 500 | 213 | 0.426 | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 500 | 209 | 0.418 | `INSERT INTO "public"."exam_attempts" ("school_id","exam_id","exam_session_id","student_profile_id","attempt_number","attempt_type","state","started_at","duratio` |
| 500 | 192 | 0.383 | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."document", "public"."attempt_question_snapshots"."school_id", "public"` |
| 5 | 180 | 36.019 | `SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number FROM attempt_answers WHERE attempt_id = ANY($1::uuid[])` |
| 500 | 172 | 0.344 | `INSERT INTO "public"."exam_participations" ("school_id","exam_id","exam_session_id","student_profile_id","status","marked_at","marked_by_membership_id") VALUES ` |
| 1000 | 150 | 0.15 | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."content", "public"."question_revisions"."question_type"::text, "public"."question_revi` |
| 1000 | 145 | 0.145 | `SELECT "public"."exam_questions"."id", "public"."exam_questions"."school_id", "public"."exam_questions"."exam_id", "public"."exam_questions"."exam_section_id", ` |

## Additional measurements

```json
{
  "burstSeconds": 7.7,
  "markingDrainSeconds": 10.1
}
```
