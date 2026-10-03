# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T16:52:26.519Z · **Duration:** 461s · **Budgets:** all met

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
| answer save p95           | 82.82 ms   | ≤ 250 ms    | PASS   |
| answer save p99           | 283.9 ms   | ≤ 750 ms    | PASS   |
| answer save success       | 100.000%   | ≥ 99.9%     | PASS   |
| start p95                 | 1439.74 ms | ≤ 2000 ms   | PASS   |
| submit p95                | 520.45 ms  | ≤ 2000 ms   | PASS   |
| submits accepted          | 500/500    | 500         | PASS   |
| attempts created          | 500        | exactly 500 | PASS   |
| duplicate attempts        | 0          | 0           | PASS   |
| results produced          | 500        | exactly 500 | PASS   |
| acknowledged answers lost | 0 of 16853 | 0           | PASS   |

## Latency by operation (client-observed)

| Operation                  | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| -------------------------- | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch               | 18244 | 18244 | —              | 0        | 20.93   | 82.82   | 283.9   | 620.54  |
| attempt.event              | 1498  | 1498  | —              | 0        | 17.47   | 43.46   | 67.52   | 133.76  |
| attempt.heartbeat          | 5985  | 5985  | —              | 0        | 20.96   | 86.14   | 286.72  | 573.44  |
| attempt.start              | 500   | 500   | —              | 0        | 288     | 1439.74 | 1718.27 | 2027.52 |
| attempt.status             | 500   | 500   | —              | 0        | 1845.25 | 2164.74 | 2193.41 | 2242.56 |
| attempt.submit             | 500   | 500   | —              | 0        | 46.91   | 520.45  | 706.56  | 783.36  |
| auth.login                 | 525   | 525   | —              | 0        | 191.87  | 715.78  | 931.84  | 996.35  |
| report.analytics.exam      | 1106  | 1040  | 503×66         | 0        | 69.12   | 757.76  | 1960.96 | 2852.86 |
| report.analytics.questions | 1108  | 1047  | 503×61         | 0        | 62.34   | 478.46  | 1197.06 | 2488.32 |
| report.analytics.school    | 1107  | 1026  | 503×81         | 0        | 21.02   | 847.36  | 1994.75 | 2592.77 |
| report.export              | 1104  | 1049  | 503×55         | 0        | 41.95   | 366.85  | 593.92  | 791.55  |
| report.search              | 1107  | 1019  | 503×88         | 0        | 67.78   | 482.56  | 704.51  | 974.34  |
| session.open               | 5     | 5     | —              | 0        | 1138.69 | 1231.87 | 1231.87 | 1231.87 |
| student.assessment         | 500   | 500   | —              | 0        | 129.09  | 550.91  | 739.33  | 823.3   |
| student.preview            | 500   | 500   | —              | 0        | 166.27  | 521.47  | 647.17  | 842.75  |
| tenant.resolve             | 525   | 525   | —              | 0        | 34.08   | 173.57  | 234.88  | 279.04  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 92    |
| peakConnections        | 45    |
| peakActive             | 4     |
| peakIdleInTransaction  | 32    |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 363   |
| peakCommitsPerSecond   | 676   |
| peakRedisClients       | 75    |
| peakRedisMemoryMb      | 275.8 |
| minHostFreeMemoryMb    | 12484 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 85    |
| harnessStalls          |       |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a102ae | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3492            | 0               |
| 01a102ae | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3409            | 0               |
| 01a102ae | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3460            | 0               |
| 01a102ae | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3308            | 0               |
| 01a102ae | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3184            | 0               |

## Storage growth (500 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 500        | 286720      | 573             |
| attempt_question_snapshots | 500        | 5349376     | 10699           |
| attempt_answers            | 16853      | 5300224     | 10600           |
| attempt_answer_events      | 18285      | 5357568     | 10715           |
| attempt_question_results   | 20000      | 5881856     | 11764           |
| attempt_events             | 1498       | 163840      | 328             |
| results                    | 500        | 245760      | 492             |
| exam_session_participants  | 1500       | 507904      | 1016            |
| exam_participations        | 500        | 73728       | 147             |
| audit_events               | 2604       | 1654784     | 3310            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18285 | 4031     | 0.22    | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f`       |
| 1019  | 3976     | 3.902   | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm`       |
| 20000 | 3002     | 0.15    | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated`       |
| 912   | 2797     | 3.067   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 210   | 2374     | 11.304  | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 18285 | 2366     | 0.129   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w`       |
| 5     | 1924     | 384.795 | `SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number FROM attempt_answers WHERE attempt_id = ANY($1::uuid[])`                     |
| 1019  | 1597     | 1.567   | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 1049  | 1570     | 1.497   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 390   | 1476     | 3.784   | `SELECT "public"."exam_attempts"."id" FROM "public"."exam_attempts" WHERE ("public"."exam_attempts"."school_id" = $1 AND "public"."exam_attempts"."state" = CAST(`       |
| 1019  | 1348     | 1.323   | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web`       |
| 1049  | 1330     | 1.268   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |
| 210   | 1306     | 6.217   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state`       |
| 2208  | 1298     | 0.588   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 1049  | 1283     | 1.223   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id", "public"."student_profiles"."stud`       |

## Additional measurements

```json
{
  "sessionOpenMs": [1232, 1149, 1103, 1139, 1070],
  "markingDrainSeconds": 2.3,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.analytics.questions:200": 1047,
    "report.export:202": 1049,
    "report.search:200": 1019,
    "report.analytics.exam:200": 1040,
    "report.analytics.school:200": 1026,
    "report.search:503": 88,
    "report.analytics.questions:503": 61,
    "report.analytics.exam:503": 66,
    "report.analytics.school:503": 81,
    "report.export:503": 55
  }
}
```
