# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T16:13:29.931Z · **Duration:** 464s · **Budgets:** NOT met

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

| Check | Actual | Budget | Result |
| --- | --- | --- | --- |
| starts failed | 0 | 0 | PASS |
| answer save p95 | 522.75 ms | ≤ 250 ms | FAIL |
| answer save p99 | 805.38 ms | ≤ 750 ms | FAIL |
| answer save success | 100.000% | ≥ 99.9% | PASS |
| start p95 | 1216.51 ms | ≤ 2000 ms | PASS |
| submit p95 | 1284.1 ms | ≤ 2000 ms | PASS |
| submits accepted | 500/500 | 500 | PASS |
| attempts created | 500 | exactly 500 | PASS |
| duplicate attempts | 0 | 0 | PASS |
| results produced | 500 | exactly 500 | PASS |
| acknowledged answers lost | 0 of 16949 | 0 | PASS |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| answer.batch | 18159 | 18159 | — | 0 | 189.7 | 522.75 | 805.38 | 1244.16 |
| attempt.event | 1497 | 1497 | — | 0 | 151.94 | 271.87 | 350.46 | 529.92 |
| attempt.heartbeat | 6013 | 6013 | — | 0 | 195.58 | 598.53 | 933.89 | 1326.08 |
| attempt.start | 500 | 500 | — | 0 | 702.98 | 1216.51 | 1346.56 | 1471.49 |
| attempt.status | 500 | 500 | — | 0 | 1682.43 | 1995.78 | 2027.52 | 2036.74 |
| attempt.submit | 500 | 500 | — | 0 | 787.97 | 1284.1 | 1552.38 | 1617.92 |
| auth.login | 525 | 525 | — | 0 | 254.59 | 647.68 | 719.87 | 843.26 |
| report.analytics.exam | 7945 | 7939 | 503×6 | 0 | 204.16 | 397.82 | 1781.76 | 2834.43 |
| report.analytics.questions | 7947 | 7941 | 503×6 | 0 | 201.86 | 400.13 | 1211.39 | 2361.34 |
| report.analytics.school | 7949 | 7940 | 503×9 | 0 | 83.33 | 190.46 | 1983.49 | 3104.77 |
| report.export | 7945 | 2510 | 429×5427 503×8 | 0 | 35.9 | 310.78 | 483.84 | 1172.48 |
| report.search | 7945 | 7937 | 503×8 | 0 | 259.2 | 464.38 | 708.1 | 1176.58 |
| session.open | 5 | 5 | — | 0 | 1179.65 | 1612.8 | 1612.8 | 1612.8 |
| student.assessment | 500 | 500 | — | 0 | 209.28 | 469.25 | 556.54 | 630.27 |
| student.preview | 500 | 500 | — | 0 | 237.06 | 433.41 | 472.83 | 501.5 |
| tenant.resolve | 525 | 525 | — | 0 | 47.3 | 161.41 | 195.2 | 216.32 |

## Server resources (sampled every 5 s)

| Metric | Value |
| --- | --- |
| samples | 92 |
| peakConnections | 45 |
| peakActive | 5 |
| peakIdleInTransaction | 40 |
| peakWaitingLocks | 0 |
| avgCommitsPerSecond | 585 |
| peakCommitsPerSecond | 729 |
| peakRedisClients | 75 |
| peakRedisMemoryMb | 380.5 |
| minHostFreeMemoryMb | 12529 |
| hostMemoryPressure | false |
| peakHarnessLoopDelayMs | 90 |
| harnessStalls |  |

## Correctness verification (database)

| Exam | Expected | Attempts | Distinct students | Duplicates | States | Results | Final | Answers checked | Lost/mismatched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01a1028a | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3577 | 0 |
| 01a1028a | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3513 | 0 |
| 01a1028a | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3400 | 0 |
| 01a1028a | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3224 | 0 |
| 01a1028a | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3235 | 0 |

## Storage growth (500 attempts)

| Table | Rows added | Bytes added | Bytes / attempt |
| --- | --- | --- | --- |
| exam_attempts | 500 | 303104 | 606 |
| attempt_question_snapshots | 500 | 5406720 | 10813 |
| attempt_answers | 16949 | 5210112 | 10420 |
| attempt_answer_events | 18443 | 5308416 | 10617 |
| attempt_question_results | 20000 | 5701632 | 11403 |
| attempt_events | 1497 | 606208 | 1212 |
| results | 500 | 483328 | 967 |
| exam_session_participants | 1500 | 507904 | 1016 |
| exam_participations | 500 | 131072 | 262 |
| audit_events | 4065 | 2514944 | 5030 |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query |
| --- | --- | --- | --- |
| 7937 | 34160 | 4.304 | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm` |
| 7937 | 12628 | 1.591 | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 7937 | 10834 | 1.365 | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web` |
| 484 | 4481 | 9.259 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 1880 | 4469 | 2.377 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 18443 | 4423 | 0.24 | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 2459 | 3624 | 1.474 | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 2459 | 3217 | 1.308 | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 20000 | 3210 | 0.161 | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 2459 | 2970 | 1.208 | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id", "public"."student_profiles"."stud` |
| 18443 | 2914 | 0.158 | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 484 | 2784 | 5.752 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state` |
| 17338 | 2731 | 0.158 | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."content", "public"."question_revisions"."question_type"::text, "public"."question_revi` |
| 17338 | 2377 | 0.137 | `SELECT "public"."exam_questions"."id", "public"."exam_questions"."school_id", "public"."exam_questions"."exam_id", "public"."exam_questions"."exam_section_id", ` |
| 484 | 2309 | 4.772 | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa` |

## Additional measurements

```json
{
  "sessionOpenMs": [
    1005,
    1180,
    1512,
    1612,
    1119
  ],
  "markingDrainSeconds": 2.1,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.analytics.questions:503": 6,
    "report.analytics.exam:503": 6,
    "report.search:503": 8,
    "report.export:503": 8,
    "report.analytics.school:503": 9,
    "report.analytics.questions:200": 7941,
    "report.analytics.school:200": 7940,
    "report.search:200": 7937,
    "report.export:202": 2510,
    "report.analytics.exam:200": 7939,
    "report.export:429": 5427
  }
}
```
