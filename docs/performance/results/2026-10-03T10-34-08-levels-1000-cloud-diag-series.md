# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T10:34:08.192Z · **Duration:** 452s · **Budgets:** NOT met

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
  "sustainSeconds": 300,
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
| answer save p95           | 2044.93 ms | ≤ 250 ms     | FAIL   |
| answer save p99           | 3076.1 ms  | ≤ 750 ms     | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%      | PASS   |
| start p95                 | 7057.41 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 1366.02 ms | ≤ 2000 ms    | PASS   |
| submits accepted          | 1000/1000  | 1000         | PASS   |
| attempts created          | 1000       | exactly 1000 | PASS   |
| duplicate attempts        | 0          | 0            | PASS   |
| results produced          | 1000       | exactly 1000 | PASS   |
| acknowledged answers lost | 0 of 34509 | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 37231 | 37231 | —              | 0        | 33.34   | 2044.93 | 3076.1  | 3540.99 |
| attempt.event      | 1497  | 1497  | —              | 0        | 25.42   | 74.11   | 159.87  | 780.8   |
| attempt.heartbeat  | 12320 | 12320 | —              | 0        | 33.25   | 2914.3  | 3782.66 | 4171.78 |
| attempt.start      | 1000  | 1000  | —              | 0        | 2609.15 | 7057.41 | 7180.29 | 7294.98 |
| attempt.status     | 1000  | 1000  | —              | 0        | 3094.53 | 3536.9  | 3577.86 | 3579.9  |
| attempt.submit     | 1000  | 1000  | —              | 0        | 61.66   | 1366.02 | 1668.1  | 1771.52 |
| auth.login         | 1005  | 1005  | —              | 0        | 1367.04 | 5738.5  | 6017.02 | 6135.81 |
| session.open       | 5     | 5     | —              | 0        | 1503.23 | 1536    | 1536    | 1536    |
| student.assessment | 1000  | 1000  | —              | 0        | 967.17  | 3758.08 | 4018.18 | 4116.48 |
| student.preview    | 1000  | 1000  | —              | 0        | 772.61  | 2498.56 | 2689.02 | 2818.05 |
| tenant.resolve     | 1005  | 1005  | —              | 0        | 308.99  | 1287.17 | 1434.62 | 1658.88 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 90    |
| peakConnections       | 45    |
| peakActive            | 5     |
| peakIdleInTransaction | 35    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 606   |
| peakCommitsPerSecond  | 780   |
| peakRedisClients      | 75    |
| peakRedisMemoryMb     | 91.9  |
| minHostFreeMemoryMb   | 12684 |
| hostMemoryPressure    | false |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a10154 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 7417            | 0               |
| 01a10154 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 7142            | 0               |
| 01a10154 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 7055            | 0               |
| 01a10154 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 6535            | 0               |
| 01a10154 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 6360            | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 1000       | 933888      | 934             |
| attempt_question_snapshots | 1000       | 10313728    | 10314           |
| attempt_answers            | 34509      | 9895936     | 9896            |
| attempt_answer_events      | 37882      | 10313728    | 10314           |
| attempt_question_results   | 40000      | 11337728    | 11338           |
| attempt_events             | 1497       | 212992      | 213             |
| results                    | 1000       | 475136      | 475             |
| exam_session_participants  | 1500       | 442368      | 442             |
| exam_participations        | 1000       | 106496      | 106             |
| audit_events               | 3035       | 1433600     | 1434            |

## Drift over time (per minute)

### answer.batch

| Minute | Count | p95 ms  | p99 ms  |
| ------ | ----- | ------- | ------- |
| 0      | 1810  | 1896.45 | 2115.58 |
| 1      | 5464  | 3139.58 | 3342.34 |
| 2      | 6032  | 73.09   | 128.58  |
| 3      | 6001  | 94.14   | 153.09  |
| 4      | 5985  | 98.5    | 245.38  |
| 5      | 6047  | 70.34   | 114.94  |
| 6      | 5186  | 935.42  | 1100.8  |
| 7      | 706   | 58.91   | 84.29   |

### attempt.heartbeat

| Minute | Count | p95 ms  | p99 ms  |
| ------ | ----- | ------- | ------- |
| 0      | 526   | 2308.1  | 2545.66 |
| 1      | 1856  | 3840    | 4059.14 |
| 2      | 2000  | 77.18   | 133.5   |
| 3      | 2000  | 94.14   | 172.03  |
| 4      | 2000  | 101.44  | 248.06  |
| 5      | 2000  | 71.36   | 116.99  |
| 6      | 1736  | 1085.44 | 1292.29 |
| 7      | 202   | 54.34   | 70.66   |

## Top statements by total time (pg_stat_statements)

| Calls  | Total ms | Mean ms | Query                                                                                                                                                              |
| ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 37882  | 9632     | 0.254   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 40000  | 6070     | 0.152   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 37882  | 5948     | 0.157   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 56048  | 1655     | 0.03    | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 56048  | 1552     | 0.028   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 56048  | 1519     | 0.027   | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 205508 | 1472     | 0.007   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 57048  | 1461     | 0.026   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 56050  | 1136     | 0.02    | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id" FROM "public"."student_profiles" W` |
| 1000   | 1122     | 1.122   | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 56050  | 1120     | 0.02    | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."user_id", "public"."school_memberships"."school_id" FROM "public"."school_memberships"` |
| 58048  | 1074     | 0.018   | `SELECT "public"."schools"."id", "public"."schools"."platform_override"::text FROM "public"."schools" WHERE ("public"."schools"."subdomain" = $1 AND $4=$5) LIMIT` |
| 37231  | 1061     | 0.029   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."state"::text, "public"."exam_attempts"."expires_at", "publ` |
| 12320  | 858      | 0.07    | `UPDATE "public"."exam_attempts" SET "last_seen_at" = $1, "updated_at" = $2 WHERE ("public"."exam_attempts"."school_id" = $3 AND "public"."exam_attempts"."id" = ` |
| 17817  | 621      | 0.035   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."exam_id", "public"."exam_attempts"."exam_session_id", "pub` |

## Additional measurements

```json
{
  "sessionOpenMs": [1503, 1517, 1448, 1535, 1347],
  "markingDrainSeconds": 3.6,
  "studentsSawResult": "1000/1000"
}
```
