# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T05:37:40.617Z · **Duration:** 7305s · **Budgets:** NOT met

## Environment

| Key         | Value                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| host        | DESKTOP-2S8H6BV                                                                                       |
| platform    | win32 10.0.26200                                                                                      |
| cpu         | 12th Gen Intel(R) Core(TM) i3-1215U                                                                   |
| logicalCpus | 8                                                                                                     |
| memoryGb    | 7.7                                                                                                   |
| node        | v22.18.0                                                                                              |
| network     | clean (loopback)                                                                                      |
| pooler      | PgBouncer (pool 40) — DIAGNOSTIC synchronous_commit=off (storage emulation, not a production setting) |

## Parameters

```json
{
  "level": 1000,
  "schools": 5,
  "questions": 40,
  "mediaKbPerQuestion": 0,
  "rampSeconds": 60,
  "sustainSeconds": 120,
  "submitSpreadSeconds": 60,
  "answerIntervalMs": 10000,
  "heartbeatMs": 30000,
  "apiProcesses": 3,
  "sseClients": 0,
  "reportingFlood": 0,
  "offeredAnswerChangesPerSecond": 100
}
```

## Budget checks

| Check                     | Actual       | Budget       | Result |
| ------------------------- | ------------ | ------------ | ------ |
| starts failed             | 851          | 0            | FAIL   |
| answer save p95           | 13090.82 ms  | ≤ 250 ms     | FAIL   |
| answer save p99           | 374079.49 ms | ≤ 750 ms     | FAIL   |
| answer save success       | 96.812%      | ≥ 99.9%      | FAIL   |
| start p95                 | 388497.41 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 1607.68 ms   | ≤ 2000 ms    | PASS   |
| submits accepted          | 149/1000     | 1000         | FAIL   |
| attempts created          | 209          | exactly 1000 | FAIL   |
| duplicate attempts        | 0            | 0            | PASS   |
| results produced          | 149          | exactly 1000 | FAIL   |
| acknowledged answers lost | 0 of 2790    | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms    | p95 ms    | p99 ms    | max ms    |
| ------------------ | ----- | ---- | -------------- | -------- | --------- | --------- | --------- | --------- |
| answer.batch       | 2635  | 2551 | —              | 84       | 117.95    | 13090.82  | 374079.49 | 379060.22 |
| attempt.event      | 85    | 85   | —              | 0        | 78.4      | 1169.41   | 1839.1    | 2267.14   |
| attempt.heartbeat  | 963   | 879  | —              | 84       | 482.3     | 16556.03  | 375914.5  | 380633.09 |
| attempt.start      | 312   | 149  | —              | 163      | 368836.61 | 388497.41 | 391380.99 | 391643.14 |
| attempt.status     | 151   | 151  | —              | 0        | 4853.76   | 5255.17   | 5275.65   | 5283.84   |
| attempt.submit     | 150   | 149  | —              | 1        | 231.17    | 1607.68   | 9011.2    | 9150.46   |
| auth.login         | 885   | 534  | —              | 351      | 19202.05  | 384827.39 | 387186.69 | 387710.98 |
| session.open       | 5     | 5    | —              | 0        | 3477.5    | 4214.78   | 4214.78   | 4214.78   |
| student.assessment | 529   | 380  | —              | 149      | 11051.01  | 379846.66 | 381157.38 | 381681.66 |
| student.preview    | 380   | 312  | —              | 68       | 7561.22   | 374079.49 | 375914.5  | 376700.93 |
| tenant.resolve     | 1005  | 885  | —              | 120      | 4263.94   | 370933.76 | 372768.77 | 373293.06 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 107   |
| peakConnections       | 42    |
| peakActive            | 18    |
| peakIdleInTransaction | 38    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 122   |
| peakCommitsPerSecond  | 253   |
| peakRedisClients      | 94    |
| peakRedisMemoryMb     | 44.3  |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States                       | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ---------------------------- | ------- | ----- | --------------- | --------------- |
| 01a10044 | 200      | 170      | 170               | 0          | SUBMITTED:110 IN_PROGRESS:60 | 110     | 110   | 2173            | 0               |
| 01a10044 | 200      | 0        | 0                 | 0          |                              | 0       | 0     | 0               | 0               |
| 01a10044 | 200      | 0        | 0                 | 0          |                              | 0       | 0     | 0               | 0               |
| 01a10044 | 200      | 0        | 0                 | 0          |                              | 0       | 0     | 0               | 0               |
| 01a10044 | 200      | 39       | 39                | 0          | SUBMITTED:39                 | 39      | 39    | 617             | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 209        | 81920       | 82              |
| attempt_question_snapshots | 209        | 2080768     | 2081            |
| attempt_answers            | 2790       | 1122304     | 1122            |
| attempt_answer_events      | 2915       | 942080      | 942             |
| attempt_question_results   | 5960       | 1769472     | 1769            |
| attempt_events             | 85         | 0           | 0               |
| results                    | 149        | 122880      | 123             |
| exam_session_participants  | 1500       | 499712      | 500             |
| exam_participations        | 209        | 32768       | 33              |
| audit_events               | 1039       | 737280      | 737             |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms  | Query                                                                                                                                                              |
| ----- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 818   | 18101    | 22.128   | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","occurred_at") VALUES ($1,$2,CAST` |
| 7027  | 17645    | 2.511    | `SELECT "public"."schools"."id", "public"."schools"."platform_override"::text FROM "public"."schools" WHERE ("public"."schools"."subdomain" = $1 AND $4=$5) LIMIT` |
| 2895  | 17357    | 5.995    | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 743   | 16141    | 21.724   | `INSERT INTO "public"."sessions" ("school_id","user_id","token_hash","created_at","expires_at","ip_address") VALUES ($1,$2,$3,$4,$5,$6) RETURNING "public"."sessi` |
| 6030  | 11670    | 1.935    | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 21    | 11632    | 553.895  | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 210   | 10976    | 52.267   | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 2894  | 8927     | 3.085    | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 776   | 8343     | 10.752   | `UPDATE "public"."users" SET "last_login_at" = $1, "updated_at" = $2 WHERE ("public"."users"."id" = $3 AND $4=$5) RETURNING "public"."users"."id", "public"."user` |
| 210   | 6808     | 32.419   | `INSERT INTO "public"."exam_attempts" ("school_id","exam_id","exam_session_id","student_profile_id","attempt_number","attempt_type","state","started_at","duratio` |
| 5775  | 5774     | 1        | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 5003  | 5639     | 1.127    | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 1     | 4924     | 4923.934 | `SELECT (SELECT count(*) FROM "attempt_question_results") AS rows, pg_total_relation_size($1) AS bytes`                                                            |
| 209   | 4511     | 21.583   | `INSERT INTO "public"."exam_participations" ("school_id","exam_id","exam_session_id","student_profile_id","status","marked_at","marked_by_membership_id") VALUES ` |
| 1     | 4148     | 4148.025 | `SELECT (SELECT count(*) FROM "attempt_answers") AS rows, pg_total_relation_size($1) AS bytes`                                                                     |

## Additional measurements

```json
{
  "sessionOpenMs": [3485, 4214, 3095, 3476, 2904],
  "markingDrainSeconds": 9.8,
  "studentsSawResult": "149/149"
}
```

## Notes

- First start failures: timeout after 30000ms
- Client-side sync errors (84): batch network: read ECONNRESET | batch network: timeout after 30000ms
