# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T16:42:28.191Z · **Duration:** 464s · **Budgets:** NOT met

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
| answer save p95           | 594.43 ms  | ≤ 250 ms    | FAIL   |
| answer save p99           | 880.64 ms  | ≤ 750 ms    | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%     | PASS   |
| start p95                 | 1643.52 ms | ≤ 2000 ms   | PASS   |
| submit p95                | 1296.38 ms | ≤ 2000 ms   | PASS   |
| submits accepted          | 500/500    | 500         | PASS   |
| attempts created          | 500        | exactly 500 | PASS   |
| duplicate attempts        | 0          | 0           | PASS   |
| results produced          | 500        | exactly 500 | PASS   |
| acknowledged answers lost | 0 of 16697 | 0           | PASS   |

## Latency by operation (client-observed)

| Operation                  | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| -------------------------- | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch               | 17922 | 17922 | —              | 0        | 212.86  | 594.43  | 880.64  | 1210.37 |
| attempt.event              | 1496  | 1496  | —              | 0        | 170.62  | 316.67  | 441.86  | 1048.06 |
| attempt.heartbeat          | 6018  | 6018  | —              | 0        | 220.16  | 663.55  | 986.11  | 1320.96 |
| attempt.start              | 500   | 500   | —              | 0        | 911.36  | 1643.52 | 2179.07 | 2412.54 |
| attempt.status             | 500   | 500   | —              | 0        | 1904.64 | 2271.23 | 2357.25 | 2383.87 |
| attempt.submit             | 500   | 500   | —              | 0        | 827.9   | 1296.38 | 1445.89 | 1690.62 |
| auth.login                 | 525   | 525   | —              | 0        | 383.49  | 900.1   | 1075.2  | 1213.44 |
| report.analytics.exam      | 7391  | 7390  | 503×1          | 0        | 231.17  | 442.37  | 1936.38 | 3153.92 |
| report.analytics.questions | 7393  | 7389  | 503×4          | 0        | 229.5   | 442.11  | 1378.3  | 2516.99 |
| report.analytics.school    | 7391  | 7387  | 503×4          | 0        | 95.49   | 209.54  | 2312.19 | 3188.74 |
| report.export              | 7389  | 2526  | 429×4861 503×2 | 0        | 45.12   | 335.36  | 520.45  | 1312.77 |
| report.search              | 7389  | 7385  | 503×4          | 0        | 298.24  | 522.75  | 775.17  | 1227.78 |
| session.open               | 5     | 5     | —              | 0        | 1193.98 | 1239.04 | 1239.04 | 1239.04 |
| student.assessment         | 500   | 500   | —              | 0        | 313.09  | 637.95  | 837.63  | 985.6   |
| student.preview            | 500   | 500   | —              | 0        | 312.58  | 573.95  | 781.82  | 887.81  |
| tenant.resolve             | 525   | 525   | —              | 0        | 85.06   | 218.11  | 321.02  | 413.44  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 92    |
| peakConnections        | 45    |
| peakActive             | 5     |
| peakIdleInTransaction  | 38    |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 568   |
| peakCommitsPerSecond   | 718   |
| peakRedisClients       | 75    |
| peakRedisMemoryMb      | 423.4 |
| minHostFreeMemoryMb    | 12216 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 77    |
| harnessStalls          |       |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a102a5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3537            | 0               |
| 01a102a5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3467            | 0               |
| 01a102a5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3348            | 0               |
| 01a102a5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3177            | 0               |
| 01a102a5 | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3168            | 0               |

## Storage growth (500 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 500        | 368640      | 737             |
| attempt_question_snapshots | 500        | 5341184     | 10682           |
| attempt_answers            | 16697      | 5103616     | 10207           |
| attempt_answer_events      | 18210      | 5218304     | 10437           |
| attempt_question_results   | 20000      | 5832704     | 11665           |
| attempt_events             | 1496       | 180224      | 360             |
| results                    | 500        | 188416      | 377             |
| exam_session_participants  | 1500       | 409600      | 819             |
| exam_participations        | 500        | 98304       | 197             |
| audit_events               | 4081       | 2211840     | 4424            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7385  | 36068    | 4.884   | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm`       |
| 7385  | 13772    | 1.865   | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 7385  | 11149    | 1.51    | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web`       |
| 1880  | 5925     | 3.151   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 484   | 5774     | 11.93   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 18210 | 4809     | 0.264   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f`       |
| 2419  | 4023     | 1.663   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 2419  | 3588     | 1.483   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |
| 484   | 3431     | 7.088   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state`       |
| 2419  | 3395     | 1.404   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id", "public"."student_profiles"."stud`       |
| 20000 | 3366     | 0.168   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated`       |
| 18210 | 3197     | 0.176   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w`       |
| 484   | 2986     | 6.168   | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa`       |
| 484   | 2813     | 5.812   | `SELECT COUNT(*) AS "_count$_all", "public"."results"."grading_scale_version_id", "public"."results"."grade" FROM "public"."results" WHERE ("public"."results"."s`       |
| 484   | 2775     | 5.733   | `SELECT COUNT(*) AS "_count$_all", AVG("percentage") AS "_avg$percentage", MAX("percentage") AS "_max$percentage", MIN("percentage") AS "_min$percentage" FROM (S`       |

## Additional measurements

```json
{
  "sessionOpenMs": [1212, 1239, 1126, 1194, 1120],
  "markingDrainSeconds": 2.4,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.search:200": 7385,
    "report.export:202": 2526,
    "report.analytics.questions:200": 7389,
    "report.analytics.school:200": 7387,
    "report.analytics.exam:200": 7390,
    "report.export:429": 4861,
    "report.search:503": 4,
    "report.analytics.school:503": 4,
    "report.analytics.exam:503": 1,
    "report.analytics.questions:503": 4,
    "report.export:503": 2
  }
}
```
