# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T15:10:45.032Z · **Duration:** 3748s · **Budgets:** NOT met

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
  "level": 1000,
  "schools": 5,
  "questions": 40,
  "mediaKbPerQuestion": 0,
  "rampSeconds": 60,
  "sustainSeconds": 3600,
  "submitSpreadSeconds": 60,
  "answerIntervalMs": 10000,
  "heartbeatMs": 30000,
  "apiProcesses": 2,
  "sseClients": 0,
  "reportingFlood": 0,
  "floodHostile": false,
  "offeredAnswerChangesPerSecond": 100
}
```

## Budget checks

| Check | Actual | Budget | Result |
| --- | --- | --- | --- |
| starts failed | 0 | 0 | PASS |
| answer save p95 | 97.34 ms | ≤ 250 ms | PASS |
| answer save p99 | 544.77 ms | ≤ 750 ms | PASS |
| answer save success | 100.000% | ≥ 99.9% | PASS |
| start p95 | 6451.2 ms | ≤ 2000 ms | FAIL |
| submit p95 | 282.37 ms | ≤ 2000 ms | PASS |
| submits accepted | 1000/1000 | 1000 | PASS |
| attempts created | 1000 | exactly 1000 | PASS |
| duplicate attempts | 0 | 0 | PASS |
| results produced | 1000 | exactly 1000 | PASS |
| acknowledged answers lost | 0 of 40000 | 0 | PASS |

## Latency by operation (client-observed)

| Operation | Count | 2xx | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| answer.batch | 366868 | 366868 | — | 0 | 24.08 | 97.34 | 544.77 | 3270.66 |
| attempt.event | 17978 | 17978 | — | 0 | 20.34 | 73.92 | 164.86 | 1009.66 |
| attempt.heartbeat | 122364 | 122364 | — | 0 | 24.38 | 101.12 | 666.11 | 3913.73 |
| attempt.start | 1000 | 1000 | — | 0 | 1532.93 | 6451.2 | 6643.71 | 6864.9 |
| attempt.status | 1000 | 1000 | — | 0 | 3104.77 | 3463.17 | 3508.22 | 3516.42 |
| attempt.submit | 1000 | 1000 | — | 0 | 54.05 | 282.37 | 445.95 | 541.7 |
| auth.login | 1005 | 1005 | — | 0 | 773.63 | 4956.16 | 5263.36 | 5414.91 |
| session.open | 5 | 5 | — | 0 | 1069.06 | 1136.64 | 1136.64 | 1136.64 |
| student.assessment | 1000 | 1000 | — | 0 | 601.09 | 3422.21 | 3682.3 | 3905.54 |
| student.preview | 1000 | 1000 | — | 0 | 501.5 | 2199.55 | 2443.26 | 2498.56 |
| tenant.resolve | 1005 | 1005 | — | 0 | 168.7 | 1114.11 | 1246.21 | 1521.66 |

## Server resources (sampled every 5 s)

| Metric | Value |
| --- | --- |
| samples | 750 |
| peakConnections | 46 |
| peakActive | 8 |
| peakIdleInTransaction | 36 |
| peakWaitingLocks | 0 |
| avgCommitsPerSecond | 617 |
| peakCommitsPerSecond | 773 |
| peakRedisClients | 75 |
| peakRedisMemoryMb | 363.1 |
| minHostFreeMemoryMb | 13151 |
| hostMemoryPressure | false |
| peakHarnessLoopDelayMs | 137 |
| harnessStalls |  |

## Correctness verification (database)

| Exam | Expected | Attempts | Distinct students | Duplicates | States | Results | Final | Answers checked | Lost/mismatched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01a10251 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 8000 | 0 |
| 01a10251 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 8000 | 0 |
| 01a10251 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 8000 | 0 |
| 01a10251 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 8000 | 0 |
| 01a10251 | 200 | 200 | 200 | 0 | SUBMITTED:200 | 200 | 200 | 8000 | 0 |

## Storage growth (1000 attempts)

| Table | Rows added | Bytes added | Bytes / attempt |
| --- | --- | --- | --- |
| exam_attempts | 1000 | 540672 | 541 |
| attempt_question_snapshots | 1000 | 10846208 | 10846 |
| attempt_answers | 40000 | 12656640 | 12657 |
| attempt_answer_events | 368109 | 76906496 | 76906 |
| attempt_question_results | 40000 | 11132928 | 11133 |
| attempt_events | 17978 | 2736128 | 2736 |
| results | 1000 | 827392 | 827 |
| exam_session_participants | 1500 | 393216 | 393 |
| exam_participations | 1000 | 425984 | 426 |
| audit_events | 3035 | 1892352 | 1892 |

## Drift over time (per minute)

### answer.batch

| Minute | Count | p95 ms | p99 ms |
| --- | --- | --- | --- |
| 0 | 2108 | 1618.94 | 1856.51 |
| 1 | 5578 | 2775.04 | 3047.42 |
| 2 | 5937 | 76.8 | 159.36 |
| 3 | 6007 | 74.05 | 123.58 |
| 4 | 5937 | 73.6 | 123.26 |
| 5 | 5824 | 62.53 | 104.9 |
| 6 | 6065 | 72.32 | 155.52 |
| 7 | 5975 | 70.34 | 117.18 |
| 8 | 6109 | 72.9 | 218.24 |
| 9 | 6024 | 67.26 | 173.44 |
| 10 | 5936 | 67.58 | 124.99 |
| 11 | 6003 | 63.33 | 114.05 |
| 12 | 5971 | 87.55 | 171.78 |
| 13 | 6050 | 102.08 | 210.43 |
| 14 | 5929 | 87.49 | 152.7 |
| 15 | 6046 | 107.33 | 254.59 |
| 16 | 5958 | 103.94 | 176.26 |
| 17 | 5986 | 100.67 | 177.02 |
| 18 | 6106 | 84.74 | 162.18 |
| 19 | 5975 | 74.82 | 126.21 |
| 20 | 6009 | 73.09 | 150.27 |
| 21 | 6040 | 302.59 | 903.68 |
| 22 | 6074 | 120.83 | 304.9 |
| 23 | 6218 | 80.26 | 137.98 |
| 24 | 5916 | 71.3 | 134.02 |
| 25 | 6127 | 77.25 | 164.35 |
| 26 | 5964 | 79.49 | 155.01 |
| 27 | 5912 | 80.19 | 156.03 |
| 28 | 6015 | 74.11 | 147.58 |
| 29 | 5784 | 68.1 | 127.49 |
| 30 | 6026 | 540.16 | 759.81 |
| 31 | 5992 | 93.38 | 172.03 |
| 32 | 5989 | 83.14 | 171.39 |
| 33 | 5888 | 89.79 | 174.08 |
| 34 | 5952 | 78.85 | 157.44 |
| 35 | 5852 | 93.06 | 148.35 |
| 36 | 5961 | 80.64 | 122.94 |
| 37 | 5972 | 77.06 | 156.42 |
| 38 | 5983 | 105.34 | 335.36 |
| 39 | 6048 | 68.1 | 120.51 |
| 40 | 5912 | 72.64 | 118.14 |
| 41 | 5919 | 66.18 | 129.41 |
| 42 | 6100 | 81.02 | 137.34 |
| 43 | 6025 | 82.69 | 138.75 |
| 44 | 6012 | 70.34 | 150.4 |
| 45 | 5995 | 71.55 | 139.39 |
| 46 | 6116 | 164.22 | 293.12 |
| 47 | 6039 | 70.27 | 120.96 |
| 48 | 5934 | 56.86 | 103.62 |
| 49 | 5970 | 71.42 | 129.54 |
| 50 | 6034 | 69.63 | 122.24 |
| 51 | 5950 | 110.98 | 622.59 |
| 52 | 6109 | 70.34 | 115.71 |
| 53 | 5971 | 74.18 | 111.36 |
| 54 | 6005 | 63.36 | 100.8 |
| 55 | 6046 | 66.88 | 115.78 |
| 56 | 5956 | 83.46 | 267.26 |
| 57 | 5942 | 69.57 | 136.32 |
| 58 | 5972 | 76.99 | 124.74 |
| 59 | 6198 | 99.52 | 267.52 |
| 60 | 5918 | 275.97 | 424.96 |
| 61 | 5069 | 233.73 | 319.23 |
| 62 | 430 | 76.29 | 124.35 |

### attempt.heartbeat

| Minute | Count | p95 ms | p99 ms |
| --- | --- | --- | --- |
| 0 | 626 | 1983.49 | 2254.85 |
| 1 | 1913 | 3489.79 | 3702.78 |
| 2 | 2008 | 80.9 | 173.18 |
| 3 | 1993 | 68.16 | 116.86 |
| 4 | 2006 | 78.27 | 123.58 |
| 5 | 2013 | 65.02 | 108.93 |
| 6 | 1992 | 75.01 | 175.87 |
| 7 | 2006 | 75.9 | 124.29 |
| 8 | 2004 | 77.44 | 234.62 |
| 9 | 1986 | 70.91 | 161.79 |
| 10 | 2008 | 72.26 | 135.04 |
| 11 | 2002 | 69.25 | 119.36 |
| 12 | 2001 | 89.34 | 193.02 |
| 13 | 2004 | 92.86 | 212.86 |
| 14 | 1977 | 96.64 | 154.37 |
| 15 | 2019 | 104.06 | 285.44 |
| 16 | 2003 | 108.1 | 185.98 |
| 17 | 1993 | 104.96 | 185.22 |
| 18 | 2003 | 88.45 | 175.1 |
| 19 | 1996 | 75.65 | 125.82 |
| 20 | 2023 | 83.01 | 160.77 |
| 21 | 2000 | 365.57 | 1133.57 |
| 22 | 1997 | 136.32 | 314.88 |
| 23 | 2004 | 81.86 | 145.79 |
| 24 | 2013 | 69.57 | 143.1 |
| 25 | 1995 | 80 | 163.97 |
| 26 | 2002 | 79.55 | 157.44 |
| 27 | 2005 | 93.57 | 170.5 |
| 28 | 1996 | 76.35 | 149.25 |
| 29 | 1990 | 73.92 | 137.98 |
| 30 | 1988 | 680.45 | 922.11 |
| 31 | 2007 | 99.84 | 180.35 |
| 32 | 1985 | 88.77 | 168.32 |
| 33 | 2014 | 89.22 | 188.29 |
| 34 | 2000 | 74.37 | 154.5 |
| 35 | 2004 | 93.57 | 144.9 |
| 36 | 1994 | 84.8 | 132.99 |
| 37 | 1994 | 76.48 | 153.86 |
| 38 | 1993 | 107.9 | 355.84 |
| 39 | 2005 | 65.92 | 110.02 |
| 40 | 2010 | 71.87 | 118.4 |
| 41 | 1995 | 69.82 | 140.67 |
| 42 | 2004 | 84.48 | 138.75 |
| 43 | 1996 | 87.04 | 148.22 |
| 44 | 2003 | 72 | 148.86 |
| 45 | 2008 | 71.81 | 130.05 |
| 46 | 2009 | 171.9 | 315.65 |
| 47 | 1993 | 76.42 | 136.06 |
| 48 | 2004 | 57.09 | 126.21 |
| 49 | 1996 | 70.14 | 136.19 |
| 50 | 1991 | 72.77 | 121.98 |
| 51 | 2006 | 131.07 | 707.07 |
| 52 | 1987 | 70.98 | 112.13 |
| 53 | 2006 | 77.5 | 119.68 |
| 54 | 1993 | 60.58 | 100.99 |
| 55 | 2003 | 66.88 | 131.71 |
| 56 | 2005 | 81.98 | 148.99 |
| 57 | 2004 | 76.86 | 142.21 |
| 58 | 2007 | 81.15 | 127.74 |
| 59 | 2002 | 107.65 | 288.77 |
| 60 | 1996 | 246.02 | 444.16 |
| 61 | 1640 | 224.9 | 325.63 |
| 62 | 144 | 68.8 | 109.95 |

## Top statements by total time (pg_stat_statements)

| Calls | Total ms | Mean ms | Query |
| --- | --- | --- | --- |
| 368109 | 68381 | 0.186 | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 368109 | 48483 | 0.132 | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 512210 | 13802 | 0.027 | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 512210 | 12239 | 0.024 | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 512210 | 11993 | 0.023 | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 3237 | 11477 | 3.545 | `SELECT "public"."exam_attempts"."id" FROM "public"."exam_attempts" WHERE ("public"."exam_attempts"."school_id" = $1 AND "public"."exam_attempts"."state" = CAST(` |
| 513210 | 11465 | 0.022 | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 1790645 | 10348 | 0.006 | `SELECT set_config($1, $2, $3)` |
| 512211 | 9206 | 0.018 | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id" FROM "public"."student_profiles" W` |
| 13839 | 9126 | 0.659 | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 13839 | 9085 | 0.656 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."state"::text FROM "public"."exam_attempts" WHERE ` |
| 366868 | 9020 | 0.025 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."state"::text, "public"."exam_attempts"."expires_at", "publ` |
| 512211 | 8735 | 0.017 | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."user_id", "public"."school_memberships"."school_id" FROM "public"."school_memberships"` |
| 13839 | 7783 | 0.562 | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa` |
| 13839 | 7192 | 0.52 | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."exam_session_id", "public"."exam_attempts"."state` |

## Additional measurements

```json
{
  "sessionOpenMs": [
    1103,
    1136,
    1069,
    1021,
    979
  ],
  "markingDrainSeconds": 3.5,
  "studentsSawResult": "1000/1000"
}
```
