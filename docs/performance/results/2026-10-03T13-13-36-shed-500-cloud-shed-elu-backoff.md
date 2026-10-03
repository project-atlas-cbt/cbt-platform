# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T13:13:36.388Z · **Duration:** 454s · **Budgets:** all met

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
| answer save p95           | 92.67 ms   | ≤ 250 ms    | PASS   |
| answer save p99           | 249.34 ms  | ≤ 750 ms    | PASS   |
| answer save success       | 100.000%   | ≥ 99.9%     | PASS   |
| start p95                 | 903.17 ms  | ≤ 2000 ms   | PASS   |
| submit p95                | 407.55 ms  | ≤ 2000 ms   | PASS   |
| submits accepted          | 500/500    | 500         | PASS   |
| attempts created          | 500        | exactly 500 | PASS   |
| duplicate attempts        | 0          | 0           | PASS   |
| results produced          | 500        | exactly 500 | PASS   |
| acknowledged answers lost | 0 of 16928 | 0           | PASS   |

## Latency by operation (client-observed)

| Operation                  | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| -------------------------- | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch               | 18279 | 18279 | —              | 0        | 29.6    | 92.67   | 249.34  | 806.4   |
| attempt.event              | 1497  | 1497  | —              | 0        | 25.22   | 72.7    | 141.57  | 485.89  |
| attempt.heartbeat          | 5996  | 5996  | —              | 0        | 29.63   | 99.97   | 258.05  | 662.02  |
| attempt.start              | 500   | 500   | —              | 0        | 112.77  | 903.17  | 1316.86 | 2895.87 |
| attempt.status             | 500   | 500   | —              | 0        | 1764.35 | 2062.34 | 2085.89 | 2089.98 |
| attempt.submit             | 500   | 500   | —              | 0        | 44.06   | 407.55  | 818.18  | 1077.25 |
| auth.login                 | 525   | 525   | —              | 0        | 56.8    | 649.22  | 1518.59 | 1819.65 |
| report.analytics.exam      | 576   | 508   | 503×68         | 0        | 65.06   | 190.59  | 2568.19 | 3219.46 |
| report.analytics.questions | 577   | 502   | 503×75         | 0        | 59.2    | 201.6   | 1451.01 | 2758.66 |
| report.analytics.school    | 580   | 495   | 503×85         | 0        | 20.26   | 91.14   | 1761.28 | 3391.49 |
| report.export              | 579   | 471   | 429×39 503×69  | 0        | 41.09   | 165.89  | 735.23  | 1460.22 |
| report.search              | 580   | 502   | 503×78         | 0        | 76.29   | 217.34  | 645.12  | 1550.34 |
| session.open               | 5     | 5     | —              | 0        | 1636.35 | 1660.93 | 1660.93 | 1660.93 |
| student.assessment         | 500   | 500   | —              | 0        | 30.06   | 403.71  | 1179.65 | 1307.65 |
| student.preview            | 500   | 500   | —              | 0        | 34.02   | 350.72  | 804.35  | 1356.8  |
| tenant.resolve             | 525   | 525   | —              | 0        | 7.1     | 170.37  | 544.26  | 945.66  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 90    |
| peakConnections        | 45    |
| peakActive             | 4     |
| peakIdleInTransaction  | 30    |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 335   |
| peakCommitsPerSecond   | 586   |
| peakRedisClients       | 75    |
| peakRedisMemoryMb      | 388.3 |
| minHostFreeMemoryMb    | 12481 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 111   |
| harnessStalls          |       |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a101e6 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3558            | 0               |
| 01a101e6 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3446            | 0               |
| 01a101e6 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3413            | 0               |
| 01a101e6 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3303            | 0               |
| 01a101e6 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3208            | 0               |

## Storage growth (500 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 500        | 434176      | 868             |
| attempt_question_snapshots | 500        | 5095424     | 10191           |
| attempt_answers            | 16928      | 5234688     | 10469           |
| attempt_answer_events      | 18334      | 5275648     | 10551           |
| attempt_question_results   | 20000      | 5849088     | 11698           |
| attempt_events             | 1497       | 196608      | 393             |
| results                    | 500        | 499712      | 999             |
| exam_session_participants  | 1500       | 425984      | 852             |
| exam_participations        | 500        | 73728       | 147             |
| audit_events               | 2026       | 827392      | 1655            |

## Top statements by total time (pg_stat_statements)

| Calls  | Total ms | Mean ms | Query                                                                                                                                                                    |
| ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18334  | 5292     | 0.289   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f`       |
| 20000  | 3192     | 0.16    | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated`       |
| 18334  | 3062     | 0.167   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w`       |
| 502    | 1978     | 3.94    | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm`       |
| 30750  | 1159     | 0.038   | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_`       |
| 30750  | 954      | 0.031   | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role`       |
| 30750  | 942      | 0.031   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |
| 31270  | 861      | 0.028   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 114284 | 850      | 0.007   | `SELECT set_config($1, $2, $3)`                                                                                                                                          |
| 1675   | 775      | 0.462   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 502    | 761      | 1.515   | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web`       |
| 471    | 742      | 1.575   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 502    | 694      | 1.383   | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 28277  | 643      | 0.023   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id" FROM "public"."student_profiles" W`       |
| 471    | 620      | 1.315   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |

## Additional measurements

```json
{
  "sessionOpenMs": [1636, 1655, 1660, 1353, 1319],
  "markingDrainSeconds": 2.1,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.search:200": 502,
    "report.analytics.questions:200": 502,
    "report.export:202": 471,
    "report.analytics.school:200": 495,
    "report.analytics.exam:200": 508,
    "report.analytics.exam:503": 68,
    "report.search:503": 78,
    "report.export:503": 69,
    "report.analytics.school:503": 85,
    "report.analytics.questions:503": 75,
    "report.export:429": 39
  }
}
```
