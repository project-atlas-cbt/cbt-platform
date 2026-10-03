# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T10:46:44.607Z · **Duration:** 185s · **Budgets:** NOT met

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
| answer save p95           | 3540.99 ms | ≤ 250 ms     | FAIL   |
| answer save p99           | 4048.9 ms  | ≤ 750 ms     | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%      | PASS   |
| start p95                 | 8978.43 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 2179.07 ms | ≤ 2000 ms    | FAIL   |
| submits accepted          | 1000/1000  | 1000         | PASS   |
| attempts created          | 1000       | exactly 1000 | PASS   |
| duplicate attempts        | 0          | 0            | PASS   |
| results produced          | 1000       | exactly 1000 | PASS   |
| acknowledged answers lost | 0 of 10602 | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 10248 | 10248 | —              | 0        | 164.99  | 3540.99 | 4048.9  | 4243.46 |
| attempt.event      | 149   | 149   | —              | 0        | 25.42   | 81.34   | 167.81  | 450.82  |
| attempt.heartbeat  | 3477  | 3477  | —              | 0        | 276.22  | 4567.04 | 4960.26 | 5185.54 |
| attempt.start      | 1000  | 1000  | —              | 0        | 2279.42 | 8978.43 | 9207.81 | 9297.92 |
| attempt.status     | 1000  | 1000  | —              | 0        | 3100.67 | 3457.02 | 3491.84 | 3497.98 |
| attempt.submit     | 1000  | 1000  | —              | 0        | 80.06   | 2179.07 | 3174.4  | 3307.52 |
| auth.login         | 1005  | 1005  | —              | 0        | 1104.9  | 7450.62 | 7630.85 | 7688.19 |
| session.open       | 5     | 5     | —              | 0        | 1188.86 | 1291.26 | 1291.26 | 1291.26 |
| student.assessment | 1000  | 1000  | —              | 0        | 833.02  | 4878.34 | 5017.6  | 5128.19 |
| student.preview    | 1000  | 1000  | —              | 0        | 669.7   | 3024.9  | 3203.07 | 3368.96 |
| tenant.resolve     | 1005  | 1005  | —              | 0        | 253.18  | 1544.19 | 1861.63 | 1955.84 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 37    |
| peakConnections       | 45    |
| peakActive            | 4     |
| peakIdleInTransaction | 36    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 585   |
| peakCommitsPerSecond  | 892   |
| peakRedisClients      | 75    |
| peakRedisMemoryMb     | 122.5 |
| minHostFreeMemoryMb   | 12546 |
| hostMemoryPressure    | false |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a1015f | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2690            | 0               |
| 01a1015f | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2458            | 0               |
| 01a1015f | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 2215            | 0               |
| 01a1015f | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 1799            | 0               |
| 01a1015f | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 1440            | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 1000       | 696320      | 696             |
| attempt_question_snapshots | 1000       | 10887168    | 10887           |
| attempt_answers            | 10602      | 2727936     | 2728            |
| attempt_answer_events      | 10832      | 3366912     | 3367            |
| attempt_question_results   | 40000      | 11386880    | 11387           |
| attempt_events             | 149        | 49152       | 49              |
| results                    | 1000       | 671744      | 672             |
| exam_session_participants  | 1500       | 442368      | 442             |
| exam_participations        | 1000       | 589824      | 590             |
| audit_events               | 3035       | 1835008     | 1835            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                              |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 40000 | 6846     | 0.171   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 10832 | 3136     | 0.29    | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 10832 | 2039     | 0.188   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 1000  | 1139     | 1.139   | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 77316 | 641      | 0.008   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 18874 | 617      | 0.033   | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 19874 | 573      | 0.029   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 18874 | 562      | 0.03    | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 18874 | 558      | 0.03    | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 2000  | 541      | 0.27    | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","occurred_at") VALUES ($1,$2,CAST` |
| 1000  | 525      | 0.525   | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 1000  | 523      | 0.523   | `INSERT INTO "public"."exam_attempts" ("school_id","exam_id","exam_session_id","student_profile_id","attempt_number","attempt_type","state","started_at","duratio` |
| 1000  | 469      | 0.469   | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 1000  | 458      | 0.458   | `INSERT INTO "public"."results" ("school_id","attempt_id","exam_id","student_profile_id","state","total_marks","earned_marks","percentage","correct_count","incor` |
| 1000  | 446      | 0.446   | `SELECT "public"."question_options"."id", "public"."question_options"."school_id", "public"."question_options"."question_revision_id", "public"."question_options` |

## Additional measurements

```json
{
  "sessionOpenMs": [1291, 1289, 1188, 1059, 1168],
  "markingDrainSeconds": 3.5,
  "studentsSawResult": "1000/1000"
}
```
