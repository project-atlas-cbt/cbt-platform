# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T10:42:47.125Z · **Duration:** 179s · **Budgets:** NOT met

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
  "level": 1000,
  "schools": 5,
  "questions": 40,
  "mediaKbPerQuestion": 0,
  "rampSeconds": 60,
  "sustainSeconds": 30,
  "submitSpreadSeconds": 60,
  "answerIntervalMs": 10000,
  "heartbeatMs": 30000,
  "apiProcesses": 2,
  "sseClients": 0,
  "reportingFlood": 0,
  "offeredAnswerChangesPerSecond": 100
}
```

## Budget checks

| Check                     | Actual     | Budget       | Result |
| ------------------------- | ---------- | ------------ | ------ |
| starts failed             | 0          | 0            | PASS   |
| answer save p95           | 2699.26 ms | ≤ 250 ms     | FAIL   |
| answer save p99           | 2945.02 ms | ≤ 750 ms     | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%      | PASS   |
| start p95                 | 6406.14 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 713.22 ms  | ≤ 2000 ms    | PASS   |
| submits accepted          | 1000/1000  | 1000         | PASS   |
| attempts created          | 1000       | exactly 1000 | PASS   |
| duplicate attempts        | 0          | 0            | PASS   |
| results produced          | 1000       | exactly 1000 | PASS   |
| acknowledged answers lost | 0 of 10274 | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 10007 | 10007 | —              | 0        | 84.93   | 2699.26 | 2945.02 | 3143.68 |
| attempt.event      | 149   | 149   | —              | 0        | 25.92   | 80.7    | 147.33  | 194.3   |
| attempt.heartbeat  | 3360  | 3360  | —              | 0        | 90.82   | 3338.24 | 3581.95 | 3741.7  |
| attempt.start      | 1000  | 1000  | —              | 0        | 1972.22 | 6406.14 | 6754.3  | 6897.66 |
| attempt.status     | 1000  | 1000  | —              | 0        | 3567.62 | 3948.54 | 3993.6  | 4001.79 |
| attempt.submit     | 1000  | 1000  | —              | 0        | 57.09   | 713.22  | 980.99  | 1163.26 |
| auth.login         | 1005  | 1005  | —              | 0        | 1027.58 | 5185.54 | 5443.58 | 5677.06 |
| session.open       | 5     | 5     | —              | 0        | 1282.05 | 1360.9  | 1360.9  | 1360.9  |
| student.assessment | 1000  | 1000  | —              | 0        | 791.55  | 3436.54 | 3610.62 | 3694.59 |
| student.preview    | 1000  | 1000  | —              | 0        | 623.1   | 2240.51 | 2332.67 | 2467.84 |
| tenant.resolve     | 1005  | 1005  | —              | 0        | 229.63  | 1191.94 | 1396.74 | 1497.09 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 36    |
| peakConnections       | 45    |
| peakActive            | 4     |
| peakIdleInTransaction | 37    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 609   |
| peakCommitsPerSecond  | 1367  |
| peakRedisClients      | 75    |
| peakRedisMemoryMb     | 107.9 |
| minHostFreeMemoryMb   | 12568 |
| hostMemoryPressure    | false |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a1015b | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2679            | 0               |
| 01a1015c | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2440            | 0               |
| 01a1015c | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2095            | 0               |
| 01a1015c | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 1713            | 0               |
| 01a1015c | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 1347            | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 1000       | 729088      | 729             |
| attempt_question_snapshots | 1000       | 10919936    | 10920           |
| attempt_answers            | 10274      | 3375104     | 3375            |
| attempt_answer_events      | 10483      | 2859008     | 2859            |
| attempt_question_results   | 40000      | 11304960    | 11305           |
| attempt_events             | 149        | 8192        | 8               |
| results                    | 1000       | 573440      | 573             |
| exam_session_participants  | 1500       | 385024      | 385             |
| exam_participations        | 1000       | 491520      | 492             |
| audit_events               | 3035       | 1581056     | 1581            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                              |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 40000 | 6216     | 0.155   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 10483 | 2838     | 0.271   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 10483 | 1856     | 0.177   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 1000  | 1084     | 1.084   | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 18516 | 582      | 0.031   | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 76186 | 573      | 0.008   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 19516 | 538      | 0.028   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 18516 | 534      | 0.029   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 18516 | 529      | 0.029   | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 2000  | 503      | 0.252   | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","occurred_at") VALUES ($1,$2,CAST` |
| 1000  | 495      | 0.495   | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 1000  | 468      | 0.468   | `INSERT INTO "public"."exam_attempts" ("school_id","exam_id","exam_session_id","student_profile_id","attempt_number","attempt_type","state","started_at","duratio` |
| 1000  | 440      | 0.44    | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 848   | 438      | 0.516   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."state"::text FROM "public"."exam_attempts" WHERE ` |
| 1000  | 428      | 0.428   | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."document", "public"."attempt_question_snapshots"."school_id", "public"` |

## Additional measurements

```json
{
  "sessionOpenMs": [1361, 1338, 1282, 1103, 1095],
  "markingDrainSeconds": 4,
  "studentsSawResult": "1000/1000"
}
```
