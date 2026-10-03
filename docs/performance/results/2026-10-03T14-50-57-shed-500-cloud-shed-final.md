# B21 shed: 500 concurrent attempts

**Scenario:** `shed` · **Started:** 2026-10-03T14:50:57.111Z · **Duration:** 462s · **Budgets:** NOT met

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
| answer save p95 | 423.42 ms | ≤ 250 ms | FAIL |
| answer save p99 | 548.35 ms | ≤ 750 ms | PASS |
| answer save success | 100.000% | ≥ 99.9% | PASS |
| start p95 | 1274.88 ms | ≤ 2000 ms | PASS |
| submit p95 | 854.53 ms | ≤ 2000 ms | PASS |
| submits accepted | 500/500 | 500 | PASS |
| attempts created | 500 | exactly 500 | PASS |
| duplicate attempts | 0 | 0 | PASS |
| results produced | 500 | exactly 500 | PASS |
| acknowledged answers lost | 0 of 16859 | 0 | PASS |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| answer.batch | 18013 | 18013 | — | 0 | 173.7 | 423.42 | 548.35 | 798.72 |
| attempt.event | 1497 | 1497 | — | 0 | 139.52 | 231.55 | 283.65 | 531.97 |
| attempt.heartbeat | 6005 | 6005 | — | 0 | 178.69 | 453.12 | 607.74 | 816.64 |
| attempt.start | 500 | 500 | — | 0 | 685.06 | 1274.88 | 1447.94 | 1606.66 |
| attempt.status | 500 | 500 | — | 0 | 1647.62 | 1821.7 | 1854.46 | 1856.51 |
| attempt.submit | 500 | 500 | — | 0 | 567.3 | 854.53 | 910.85 | 951.81 |
| auth.login | 525 | 525 | — | 0 | 249.6 | 665.6 | 829.95 | 998.91 |
| report.analytics.exam | 8769 | 8763 | 503×6 | 0 | 189.18 | 372.22 | 1297.41 | 2142.21 |
| report.analytics.questions | 8770 | 8766 | 503×4 | 0 | 188.16 | 368.9 | 969.22 | 2250.75 |
| report.analytics.school | 8773 | 8768 | 503×5 | 0 | 78.02 | 176.51 | 1418.24 | 2830.34 |
| report.export | 8773 | 2608 | 429×6153 503×12 | 0 | 33.41 | 283.65 | 433.41 | 1537.02 |
| report.search | 8772 | 8765 | 503×7 | 0 | 243.71 | 429.82 | 596.99 | 989.18 |
| session.open | 5 | 5 | — | 0 | 1046.02 | 1101.82 | 1101.82 | 1101.82 |
| student.assessment | 500 | 500 | — | 0 | 209.28 | 508.93 | 595.97 | 774.66 |
| student.preview | 500 | 500 | — | 0 | 230.4 | 453.12 | 518.91 | 643.07 |
| tenant.resolve | 525 | 525 | — | 0 | 45.12 | 150.53 | 222.72 | 324.35 |

## Server resources (sampled every 5 s)

| Metric | Value |
| --- | --- |
| samples | 92 |
| peakConnections | 45 |
| peakActive | 6 |
| peakIdleInTransaction | 37 |
| peakWaitingLocks | 0 |
| avgCommitsPerSecond | 614 |
| peakCommitsPerSecond | 747 |
| peakRedisClients | 75 |
| peakRedisMemoryMb | 220 |
| minHostFreeMemoryMb | 12362 |
| hostMemoryPressure | false |
| peakHarnessLoopDelayMs | 78 |
| harnessStalls |  |

## Correctness verification (database)

| Exam | Expected | Attempts | Distinct students | Duplicates | States | Results | Final | Answers checked | Lost/mismatched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01a1023f | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3562 | 0 |
| 01a1023f | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3472 | 0 |
| 01a1023f | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3343 | 0 |
| 01a1023f | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3298 | 0 |
| 01a1023f | 100 | 100 | 100 | 0 | SUBMITTED:100 | 100 | 100 | 3184 | 0 |

## Storage growth (500 attempts)

| Table | Rows added | Bytes added | Bytes / attempt |
| --- | --- | --- | --- |
| exam_attempts | 500 | 647168 | 1294 |
| attempt_question_snapshots | 500 | 5382144 | 10764 |
| attempt_answers | 16859 | 4800512 | 9601 |
| attempt_answer_events | 18261 | 5103616 | 10207 |
| attempt_question_results | 20000 | 5726208 | 11452 |
| attempt_events | 1497 | 516096 | 1032 |
| results | 500 | 352256 | 705 |
| exam_session_participants | 1500 | 385024 | 770 |
| exam_participations | 500 | 163840 | 328 |
| audit_events | 4163 | 2572288 | 5145 |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query |
| --- | --- | --- | --- |
| 8765 | 38850 | 4.432 | `SELECT sp.id FROM student_profiles sp JOIN school_memberships sm ON sm.id=sp.membership_id JOIN users u ON u.id=sm.user_id WHERE to_tsvector($3, coalesce(sp.adm` |
| 8765 | 14890 | 1.699 | `SELECT sm.id FROM school_memberships sm JOIN users u ON u.id=sm.user_id WHERE to_tsvector($2, coalesce(u.first_name,$3) \|\| $4 \|\| coalesce(u.last_name,$5) \|\| $6 ` |
| 8765 | 12073 | 1.377 | `SELECT qr.question_id AS id FROM question_revisions qr JOIN questions qn ON qn.current_revision_id = qr.id WHERE to_tsvector($2, coalesce(qr.content,$3)) @@ web` |
| 628 | 4756 | 7.574 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 2440 | 4438 | 1.819 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 18261 | 4417 | 0.242 | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 2573 | 3912 | 1.52 | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 2573 | 3464 | 1.346 | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 2573 | 3278 | 1.274 | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id", "public"."student_profiles"."stud` |
| 20000 | 3110 | 0.155 | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 19110 | 3085 | 0.161 | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."content", "public"."question_revisions"."question_type"::text, "public"."question_revi` |
| 18261 | 2893 | 0.158 | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 628 | 2591 | 4.125 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state` |
| 19110 | 2421 | 0.127 | `SELECT "public"."exam_questions"."id", "public"."exam_questions"."school_id", "public"."exam_questions"."exam_id", "public"."exam_questions"."exam_section_id", ` |
| 628 | 2362 | 3.762 | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa` |

## Additional measurements

```json
{
  "sessionOpenMs": [
    1102,
    972,
    994,
    1076,
    1046
  ],
  "markingDrainSeconds": 1.9,
  "studentsSawResult": "500/500",
  "reportingFlood": {
    "report.search:503": 7,
    "report.analytics.exam:503": 6,
    "report.analytics.school:503": 5,
    "report.analytics.questions:503": 4,
    "report.export:503": 12,
    "report.analytics.school:200": 8768,
    "report.search:200": 8765,
    "report.export:202": 2608,
    "report.analytics.exam:200": 8763,
    "report.analytics.questions:200": 8766,
    "report.export:429": 6153
  }
}
```
