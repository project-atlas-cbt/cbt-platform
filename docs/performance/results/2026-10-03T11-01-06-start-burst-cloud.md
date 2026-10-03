# B21 500 simultaneous starts (each double-fired)

**Scenario:** `start-burst` · **Started:** 2026-10-03T11:01:06.453Z · **Duration:** 37s · **Budgets:** NOT met

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
  "n": 500,
  "schools": 5,
  "questions": 40,
  "apiProcesses": 2
}
```

## Budget checks

| Check                       | Actual      | Budget      | Result |
| --------------------------- | ----------- | ----------- | ------ |
| start requests answered 200 | 1000/1000   | 1000        | PASS   |
| burst wall time             | 15.1 s      | ≤ 60 s      | PASS   |
| start p95                   | 14983.17 ms | ≤ 2000 ms   | FAIL   |
| attempts created            | 500         | exactly 500 | PASS   |
| duplicate attempts          | 0           | 0           | PASS   |
| acknowledged answers lost   | 0 of 0      | 0           | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms   | p95 ms   | p99 ms   | max ms   |
| ------------------ | ----- | ---- | -------------- | -------- | -------- | -------- | -------- | -------- |
| attempt.start      | 1000  | 1000 | —              | 0        | 14147.58 | 14983.17 | 15065.09 | 15114.24 |
| auth.login         | 505   | 505  | —              | 0        | 321.28   | 532.99   | 852.48   | 916.48   |
| session.open       | 5     | 5    | —              | 0        | 1396.74  | 1692.67  | 1692.67  | 1692.67  |
| student.assessment | 500   | 500  | —              | 0        | 255.49   | 353.02   | 397.06   | 451.58   |
| student.preview    | 500   | 500  | —              | 0        | 279.55   | 404.99   | 487.94   | 531.97   |
| tenant.resolve     | 505   | 505  | —              | 0        | 61.98    | 237.31   | 261.12   | 365.82   |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 7     |
| peakConnections       | 46    |
| peakActive            | 4     |
| peakIdleInTransaction | 38    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 641   |
| peakCommitsPerSecond  | 796   |
| peakRedisClients      | 75    |
| peakRedisMemoryMb     | 152.4 |
| minHostFreeMemoryMb   | 12439 |
| hostMemoryPressure    | false |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States          | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | --------------- | ------- | ----- | --------------- | --------------- |
| 01a1016c | 100      | 100      | 100               | 0          | IN_PROGRESS:100 | 0       | 0     | 0               | 0               |
| 01a1016c | 100      | 100      | 100               | 0          | IN_PROGRESS:100 | 0       | 0     | 0               | 0               |
| 01a1016c | 100      | 100      | 100               | 0          | IN_PROGRESS:100 | 0       | 0     | 0               | 0               |
| 01a1016c | 100      | 100      | 100               | 0          | IN_PROGRESS:100 | 0       | 0     | 0               | 0               |
| 01a1016c | 100      | 100      | 100               | 0          | IN_PROGRESS:100 | 0       | 0     | 0               | 0               |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query                                                                                                                                                              |
| ----- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 500   | 560      | 1.12    | `INSERT INTO "public"."attempt_question_snapshots" ("school_id","attempt_id","document_version","seed","document","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURN` |
| 1000  | 399      | 0.399   | `SELECT "public"."attempt_question_snapshots"."id", "public"."attempt_question_snapshots"."school_id", "public"."attempt_question_snapshots"."attempt_id", "publi` |
| 500   | 253      | 0.505   | `INSERT INTO "public"."exam_attempts" ("school_id","exam_id","exam_session_id","student_profile_id","attempt_number","attempt_type","state","started_at","duratio` |
| 500   | 246      | 0.493   | `INSERT INTO "public"."exam_participations" ("school_id","exam_id","exam_session_id","student_profile_id","status","marked_at","marked_by_membership_id") VALUES ` |
| 500   | 231      | 0.463   | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."exam_session_id", "public"."exam_session_participants"."school_id" FROM ` |
| 1500  | 226      | 0.151   | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."content", "public"."question_revisions"."question_type"::text, "public"."question_revi` |
| 500   | 204      | 0.407   | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","occurred_at") VALUES ($1,$2,CAST` |
| 1500  | 203      | 0.135   | `SELECT "public"."exam_questions"."id", "public"."exam_questions"."school_id", "public"."exam_questions"."exam_id", "public"."exam_questions"."exam_section_id", ` |
| 500   | 196      | 0.392   | `INSERT INTO "public"."sessions" ("school_id","user_id","token_hash","created_at","expires_at","ip_address") VALUES ($1,$2,$3,$4,$5,$6) RETURNING "public"."sessi` |
| 500   | 194      | 0.387   | `SELECT "public"."question_options"."id", "public"."question_options"."school_id", "public"."question_options"."question_revision_id", "public"."question_options` |
| 5     | 139      | 27.706  | `SELECT attempt_id::text, exam_question_id::text, selected_option_id::text, sequence_number FROM attempt_answers WHERE attempt_id = ANY($1::uuid[])`               |
| 1500  | 121      | 0.081   | `SELECT "public"."questions"."id", "public"."questions"."subject_id", "public"."questions"."level"::text, "public"."questions"."school_id" FROM "public"."questio` |
| 500   | 119      | 0.238   | `INSERT INTO "public"."audit_events" ("school_id","actor_user_id","actor_role","action","entity_type","entity_id","break_glass","metadata","occurred_at") VALUES ` |
| 12620 | 111      | 0.009   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 500   | 92       | 0.184   | `SELECT "public"."question_revisions"."id", "public"."question_revisions"."school_id", "public"."question_revisions"."question_id", "public"."question_revisions"` |

## Additional measurements

```json
{
  "burstSeconds": 15.1
}
```
