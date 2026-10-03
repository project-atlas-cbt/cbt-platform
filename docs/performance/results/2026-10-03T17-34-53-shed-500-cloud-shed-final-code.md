# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T17:34:53.362Z · **Duration:** 460s · **Budgets:** all met

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
  "level": 500,
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
  "reportingFlood": 20,
  "floodHostile": false,
  "offeredAnswerChangesPerSecond": 50
}
```

## Budget checks

| Check                     | Actual     | Budget      | Result |
| ------------------------- | ---------- | ----------- | ------ |
| starts failed             | 0          | 0           | PASS   |
| answer save p95           | 74.82 ms   | ≤ 250 ms    | PASS   |
| answer save p99           | 198.27 ms  | ≤ 750 ms    | PASS   |
| answer save success       | 100.000%   | ≥ 99.9%     | PASS   |
| start p95                 | 1259.52 ms | ≤ 2000 ms   | PASS   |
| submit p95                | 371.71 ms  | ≤ 2000 ms   | PASS   |
| submits accepted          | 500/500    | 500         | PASS   |
| attempts created          | 500        | exactly 500 | PASS   |
| duplicate attempts        | 0          | 0           | PASS   |
| results produced          | 500        | exactly 500 | PASS   |
| acknowledged answers lost | 0 of 16632 | 0           | PASS   |

## Latency by operation (client-observed)

| Operation                  | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| -------------------------- | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch               | 17971 | 17971 | —              | 0        | 19.22   | 74.82   | 198.27  | 657.92  |
| attempt.event              | 1498  | 1498  | —              | 0        | 15.98   | 34.43   | 57.09   | 188.54  |
| attempt.heartbeat          | 5979  | 5979  | —              | 0        | 19.12   | 69.5    | 195.07  | 415.74  |
| attempt.start              | 500   | 500   | —              | 0        | 239.87  | 1259.52 | 1675.26 | 1798.14 |
| attempt.status             | 500   | 500   | —              | 0        | 1712.13 | 1922.05 | 1980.42 | 2004.99 |
| attempt.submit             | 500   | 500   | —              | 0        | 39.87   | 371.71  | 450.05  | 596.48  |
| auth.login                 | 525   | 525   | —              | 0        | 117.18  | 649.22  | 845.82  | 1098.75 |
| report.analytics.exam      | 1168  | 1103  | 503×65         | 0        | 53.73   | 448.77  | 1771.52 | 2754.56 |
| report.analytics.questions | 1168  | 1109  | 503×59         | 0        | 48.74   | 354.05  | 1016.83 | 2480.13 |
| report.analytics.school    | 1169  | 1085  | 503×84         | 0        | 15.7    | 655.36  | 1767.42 | 2750.46 |
| report.export              | 1168  | 1057  | 429×43 503×68  | 0        | 29.42   | 307.97  | 514.82  | 1689.6  |
| report.search              | 1168  | 1096  | 503×72         | 0        | 56.32   | 419.84  | 602.62  | 791.55  |
| session.open               | 5     | 5     | —              | 0        | 1036.8  | 1147.9  | 1147.9  | 1147.9  |
| student.assessment         | 500   | 500   | —              | 0        | 74.24   | 501.5   | 640.51  | 743.42  |
| student.preview            | 500   | 500   | —              | 0        | 75.46   | 488.7   | 593.41  | 713.22  |
| tenant.resolve             | 525   | 525   | —              | 0        | 20.14   | 135.3   | 257.41  | 294.66  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 92    |
| peakConnections        | 45    |
| peakActive             | 4     |
| peakIdleInTransaction  | 34    |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 388   |
| peakCommitsPerSecond   | 670   |
| peakRedisClients       | 75    |
| peakRedisMemoryMb      | 311.3 |
| minHostFreeMemoryMb    | 12363 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 68    |
| harnessStalls          |       |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a102d5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3400            | 0               |
| 01a102d5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3470            | 0               |
| 01a102d5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3281            | 0               |
| 01a102d5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3297            | 0               |
| 01a102d5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3184            | 0               |

## Storage growth (500 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 500        | 352256      | 705             |
| attempt_question_snapshots | 500        | 5644288     | 11289           |
| attempt_answers            | 16632      | 5144576     | 10289           |
| attempt_answer_events      | 18005      | 5226496     | 10453           |
| attempt_question_results   | 20000      | 5709824     | 11420           |
| attempt_events             | 1498       | 393216      | 786             |
| results                    | 500        | 221184      | 442             |
| exam_session_participants  | 1500       | 466944      | 934             |
| exam_participations        | 500        | 294912      | 590             |
| audit_events               | 2612       | 1548288     | 3097            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1096  | 3955     | 3.608   | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm`       |
| 18005 | 3662     | 0.203   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f`       |
| 20000 | 2735     | 0.137   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated`       |
| 880   | 2733     | 3.105   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 238   | 2414     | 10.144  | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 18005 | 2174     | 0.121   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w`       |
| 5     | 1820     | 363.964 | `SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number FROM attempt_answers WHERE attempt_id = ANY($1::uuid[])`                     |
| 1050  | 1691     | 1.61    | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 1096  | 1660     | 1.514   | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 238   | 1462     | 6.143   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state`       |
| 1096  | 1377     | 1.256   | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web`       |
| 500   | 1285     | 2.569   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."exam_session_id", "public"."exam_session_participants"."school_id" FROM `       |
| 5280  | 1260     | 0.239   | `SELECT "public"."exam_attempts"."id" FROM "public"."exam_attempts" WHERE ("public"."exam_attempts"."school_id" = $1 AND "public"."exam_attempts"."state" = CAST(`       |
| 1050  | 1259     | 1.199   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |
| 4641  | 1219     | 0.263   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |

## Additional measurements

```json
{
  "sessionOpenMs": [1147, 1099, 999, 1037, 901],
  "markingDrainSeconds": 2,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.export:202": 1057,
    "report.analytics.questions:200": 1109,
    "report.search:200": 1096,
    "report.analytics.school:200": 1085,
    "report.analytics.exam:200": 1103,
    "report.analytics.school:503": 84,
    "report.analytics.questions:503": 59,
    "report.analytics.exam:503": 65,
    "report.export:503": 68,
    "report.export:429": 43,
    "report.search:503": 72
  }
}
```
