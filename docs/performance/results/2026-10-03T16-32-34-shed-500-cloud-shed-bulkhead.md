# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T16:32:34.428Z · **Duration:** 463s · **Budgets:** NOT met

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
| answer save p95           | 520.19 ms  | ≤ 250 ms    | FAIL   |
| answer save p99           | 756.74 ms  | ≤ 750 ms    | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%     | PASS   |
| start p95                 | 1338.37 ms | ≤ 2000 ms   | PASS   |
| submit p95                | 1195.01 ms | ≤ 2000 ms   | PASS   |
| submits accepted          | 500/500    | 500         | PASS   |
| attempts created          | 500        | exactly 500 | PASS   |
| duplicate attempts        | 0          | 0           | PASS   |
| results produced          | 500        | exactly 500 | PASS   |
| acknowledged answers lost | 0 of 16904 | 0           | PASS   |

## Latency by operation (client-observed)

| Operation                  | Count | 2xx   | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| -------------------------- | ----- | ----- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch               | 18164 | 18164 | —              | 0        | 202.24  | 520.19  | 756.74  | 1122.3  |
| attempt.event              | 1496  | 1496  | —              | 0        | 163.33  | 286.72  | 380.42  | 664.06  |
| attempt.heartbeat          | 6027  | 6027  | —              | 0        | 210.18  | 592.38  | 861.7   | 1219.58 |
| attempt.start              | 500   | 500   | —              | 0        | 869.38  | 1338.37 | 1733.63 | 1871.87 |
| attempt.status             | 500   | 500   | —              | 0        | 1867.78 | 2049.02 | 2086.91 | 2111.49 |
| attempt.submit             | 500   | 500   | —              | 0        | 785.92  | 1195.01 | 1402.88 | 1589.25 |
| auth.login                 | 525   | 525   | —              | 0        | 362.5   | 699.9   | 795.14  | 1008.13 |
| report.analytics.exam      | 7796  | 7794  | 503×2          | 0        | 219.26  | 422.91  | 1703.94 | 2891.78 |
| report.analytics.questions | 7794  | 7792  | 503×2          | 0        | 219.78  | 434.43  | 1234.94 | 2385.92 |
| report.analytics.school    | 7793  | 7786  | 503×7          | 0        | 90.18   | 204.67  | 1935.36 | 2893.82 |
| report.export              | 7792  | 2560  | 429×5232       | 0        | 40.99   | 317.7   | 501.5   | 1110.02 |
| report.search              | 7789  | 7788  | 503×1          | 0        | 280.58  | 498.43  | 717.82  | 1088.51 |
| session.open               | 5     | 5     | —              | 0        | 1207.3  | 1288.19 | 1288.19 | 1288.19 |
| student.assessment         | 500   | 500   | —              | 0        | 291.84  | 533.5   | 621.57  | 702.46  |
| student.preview            | 500   | 500   | —              | 0        | 304.9   | 470.78  | 605.7   | 697.86  |
| tenant.resolve             | 525   | 525   | —              | 0        | 79.62   | 177.41  | 260.35  | 302.34  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 92    |
| peakConnections        | 45    |
| peakActive             | 6     |
| peakIdleInTransaction  | 38    |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 584   |
| peakCommitsPerSecond   | 728   |
| peakRedisClients       | 75    |
| peakRedisMemoryMb      | 409   |
| minHostFreeMemoryMb    | 12274 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 97    |
| harnessStalls          |       |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a1029c | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3558            | 0               |
| 01a1029c | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3493            | 0               |
| 01a1029c | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3342            | 0               |
| 01a1029c | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3332            | 0               |
| 01a1029c | 100      | 100      | 100               | 0          | SUBMITTED:100 | 100     | 100   | 3179            | 0               |

## Storage growth (500 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 500        | 385024      | 770             |
| attempt_question_snapshots | 500        | 5373952     | 10748           |
| attempt_answers            | 16904      | 5193728     | 10387           |
| attempt_answer_events      | 18432      | 5259264     | 10519           |
| attempt_question_results   | 20000      | 5775360     | 11551           |
| attempt_events             | 1496       | 172032      | 344             |
| results                    | 500        | 516096      | 1032            |
| exam_session_participants  | 1500       | 434176      | 868             |
| exam_participations        | 500        | 114688      | 229             |
| audit_events               | 4115       | 2105344     | 4211            |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                                    |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7788  | 36392    | 4.673   | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm`       |
| 7788  | 13889    | 1.783   | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 7788  | 11238    | 1.443   | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web`       |
| 2088  | 5695     | 2.728   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 502   | 5659     | 11.273  | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_`       |
| 18432 | 4659     | 0.253   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f`       |
| 2494  | 3953     | 1.585   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."`       |
| 2494  | 3540     | 1.419   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo`       |
| 2494  | 3310     | 1.327   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id", "public"."student_profiles"."stud`       |
| 502   | 3271     | 6.517   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state`       |
| 20000 | 3227     | 0.161   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated`       |
| 18432 | 3060     | 0.166   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w`       |
| 17098 | 2870     | 0.168   | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."content", "public"."question_revisions"."question_type"::text, "public"."question_revi`       |
| 502   | 2785     | 5.548   | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa`       |
| 502   | 2539     | 5.057   | `SELECT COUNT(*) AS "_count$_all", AVG("percentage") AS "_avg$percentage", MAX("percentage") AS "_max$percentage", MIN("percentage") AS "_min$percentage" FROM (S`       |

## Additional measurements

```json
{
  "sessionOpenMs": [1288, 1247, 1170, 1207, 1190],
  "markingDrainSeconds": 2.1,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.export:202": 2560,
    "report.search:200": 7788,
    "report.analytics.questions:200": 7792,
    "report.analytics.school:200": 7786,
    "report.analytics.exam:200": 7794,
    "report.export:429": 5232,
    "report.analytics.school:503": 7,
    "report.analytics.questions:503": 2,
    "report.analytics.exam:503": 2,
    "report.search:503": 1
  }
}
```
