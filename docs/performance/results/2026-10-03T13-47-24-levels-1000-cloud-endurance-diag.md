# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T13:47:24.128Z · **Duration:** 3796s · **Budgets:** NOT met

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

> **Harness stalls:** the load generator's own event loop paused for over a second at 2026-10-03T13:54:59.051Z 1147 ms; 2026-10-03T13:55:14.536Z 1010 ms; 2026-10-03T13:55:24.420Z 1086 ms; 2026-10-03T13:55:54.533Z 1108 ms; 2026-10-03T13:56:04.666Z 1282 ms; 2026-10-03T13:56:17.109Z 2189 ms; 2026-10-03T13:56:37.902Z 4043 ms; 2026-10-03T13:56:50.505Z 3511 ms; 2026-10-03T13:56:55.269Z 1055 ms; 2026-10-03T13:57:06.597Z 1010 ms; 2026-10-03T13:57:12.009Z 2909 ms; 2026-10-03T13:57:22.913Z 1751 ms; 2026-10-03T13:57:27.913Z 1779 ms; 2026-10-03T13:57:34.046Z 1194 ms; 2026-10-03T13:57:39.512Z 1550 ms; 2026-10-03T13:57:44.534Z 1666 ms; 2026-10-03T13:57:49.933Z 1388 ms; 2026-10-03T13:58:01.025Z 5889 ms; 2026-10-03T13:59:34.001Z 4500 ms; 2026-10-03T13:59:38.767Z 1476 ms. Requests in flight then are over-measured by up to that pause, and the queued traffic is released as a burst — read the per-minute series around those times with that in mind.

## Budget checks

| Check                     | Actual      | Budget       | Result |
| ------------------------- | ----------- | ------------ | ------ |
| starts failed             | 0           | 0            | PASS   |
| answer save p95           | 1709.06 ms  | ≤ 250 ms     | FAIL   |
| answer save p99           | 30015.49 ms | ≤ 750 ms     | FAIL   |
| answer save success       | 98.508%     | ≥ 99.9%      | FAIL   |
| start p95                 | 20742.14 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 557.57 ms   | ≤ 2000 ms    | PASS   |
| submits accepted          | 1000/1000   | 1000         | PASS   |
| attempts created          | 1000        | exactly 1000 | PASS   |
| duplicate attempts        | 0           | 0            | PASS   |
| results produced          | 1000        | exactly 1000 | PASS   |
| acknowledged answers lost | 0 of 40000  | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count  | 2xx    | Other statuses | Net fail | p50 ms   | p95 ms   | p99 ms   | max ms   |
| ------------------ | ------ | ------ | -------------- | -------- | -------- | -------- | -------- | -------- |
| answer.batch       | 347538 | 342353 | 500×1576       | 3609     | 26.94    | 1709.06  | 30015.49 | 55181.31 |
| attempt.event      | 17449  | 17007  | 500×185        | 257      | 23.31    | 3518.46  | 30359.55 | 56262.66 |
| attempt.heartbeat  | 122763 | 116907 | 500×1730       | 4126     | 257.15   | 20086.78 | 32194.56 | 51347.46 |
| attempt.start      | 1000   | 1000   | —              | 0        | 14262.27 | 20742.14 | 21118.98 | 21446.66 |
| attempt.status     | 1000   | 1000   | —              | 0        | 2809.86  | 3221.5   | 3258.37  | 3262.46  |
| attempt.submit     | 1000   | 1000   | —              | 0        | 45.79    | 557.57   | 1007.1   | 1181.7   |
| auth.login         | 1005   | 1005   | —              | 0        | 5767.17  | 16220.16 | 16490.5  | 16826.37 |
| session.open       | 5      | 5      | —              | 0        | 1992.7   | 2310.14  | 2310.14  | 2310.14  |
| student.assessment | 1000   | 1000   | —              | 0        | 5132.29  | 10551.3  | 10985.47 | 11132.93 |
| student.preview    | 1000   | 1000   | —              | 0        | 3938.3   | 6987.78  | 8208.38  | 8536.06  |
| tenant.resolve     | 1005   | 1005   | —              | 0        | 1099.78  | 3276.8   | 3872.77  | 4171.78  |

## Server resources (sampled every 5 s)

| Metric                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| samples                | 753                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| peakConnections        | 45                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| peakActive             | 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| peakIdleInTransaction  | 39                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| peakWaitingLocks       | 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| avgCommitsPerSecond    | 583                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| peakCommitsPerSecond   | 950                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| peakRedisClients       | 75                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| peakRedisMemoryMb      | 420.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| minHostFreeMemoryMb    | 12060                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| hostMemoryPressure     | false                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| peakHarnessLoopDelayMs | 5889                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| harnessStalls          | 2026-10-03T13:54:59.051Z 1147 ms,2026-10-03T13:55:14.536Z 1010 ms,2026-10-03T13:55:24.420Z 1086 ms,2026-10-03T13:55:54.533Z 1108 ms,2026-10-03T13:56:04.666Z 1282 ms,2026-10-03T13:56:17.109Z 2189 ms,2026-10-03T13:56:37.902Z 4043 ms,2026-10-03T13:56:50.505Z 3511 ms,2026-10-03T13:56:55.269Z 1055 ms,2026-10-03T13:57:06.597Z 1010 ms,2026-10-03T13:57:12.009Z 2909 ms,2026-10-03T13:57:22.913Z 1751 ms,2026-10-03T13:57:27.913Z 1779 ms,2026-10-03T13:57:34.046Z 1194 ms,2026-10-03T13:57:39.512Z 1550 ms,2026-10-03T13:57:44.534Z 1666 ms,2026-10-03T13:57:49.933Z 1388 ms,2026-10-03T13:58:01.025Z 5889 ms,2026-10-03T13:59:34.001Z 4500 ms,2026-10-03T13:59:38.767Z 1476 ms |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a10205 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10205 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10205 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10205 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10205 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 1000       | 983040      | 983             |
| attempt_question_snapshots | 1000       | 10969088    | 10969           |
| attempt_answers            | 40000      | 12550144    | 12550           |
| attempt_answer_events      | 368801     | 76685312    | 76685           |
| attempt_question_results   | 40000      | 11460608    | 11461           |
| attempt_events             | 17029      | 2924544     | 2925            |
| results                    | 1000       | 802816      | 803             |
| exam_session_participants  | 1500       | 442368      | 442             |
| exam_participations        | 1000       | 516096      | 516             |
| audit_events               | 3035       | 1687552     | 1688            |

## Drift over time (per minute)

### answer.batch

| Minute | Count | p95 ms   | p99 ms   |
| ------ | ----- | -------- | -------- |
| 0      | 852   | 4788.22  | 5169.15  |
| 1      | 2085  | 9814.02  | 10321.92 |
| 2      | 5299  | 8306.69  | 8699.9   |
| 3      | 5999  | 2172.93  | 2500.61  |
| 4      | 5926  | 265.47   | 612.35   |
| 5      | 5991  | 145.15   | 258.56   |
| 6      | 5945  | 171.01   | 405.25   |
| 7      | 3067  | 23822.34 | 30015.49 |
| 8      | 1852  | 30998.53 | 31932.42 |
| 9      | 1472  | 33783.81 | 34537.47 |
| 10     | 1803  | 38731.78 | 43745.28 |
| 11     | 4882  | 21184.51 | 39911.42 |
| 12     | 5567  | 8261.63  | 8617.98  |
| 13     | 5982  | 273.66   | 483.33   |
| 14     | 6006  | 364.29   | 618.5    |
| 15     | 5822  | 336.13   | 559.1    |
| 16     | 5917  | 230.14   | 407.3    |
| 17     | 5945  | 275.71   | 451.58   |
| 18     | 6110  | 368.13   | 632.83   |
| 19     | 6033  | 374.78   | 567.3    |
| 20     | 6050  | 325.12   | 556.54   |
| 21     | 5942  | 386.82   | 744.45   |
| 22     | 5957  | 271.1    | 573.95   |
| 23     | 5874  | 395.01   | 591.87   |
| 24     | 5996  | 405.76   | 669.7    |
| 25     | 5810  | 283.14   | 483.58   |
| 26     | 5869  | 255.23   | 402.43   |
| 27     | 6067  | 369.66   | 728.06   |
| 28     | 6018  | 307.2    | 605.18   |
| 29     | 5920  | 429.57   | 638.98   |
| 30     | 5998  | 385.02   | 835.07   |
| 31     | 5862  | 307.97   | 498.43   |
| 32     | 5901  | 430.08   | 658.43   |
| 33     | 5962  | 415.49   | 833.02   |
| 34     | 6043  | 426.24   | 737.28   |
| 35     | 5955  | 503.04   | 716.8    |
| 36     | 5853  | 597.5    | 950.78   |
| 37     | 6046  | 802.82   | 1049.6   |
| 38     | 5927  | 380.42   | 896      |
| 39     | 5949  | 508.93   | 902.14   |
| 40     | 5973  | 592.38   | 758.78   |
| 41     | 6021  | 592.9    | 994.82   |
| 42     | 6009  | 455.94   | 695.3    |
| 43     | 5968  | 462.08   | 741.38   |
| 44     | 5949  | 469.5    | 844.29   |
| 45     | 5987  | 495.62   | 910.34   |
| 46     | 5999  | 373.25   | 821.76   |
| 47     | 5997  | 402.18   | 612.35   |
| 48     | 5954  | 290.56   | 506.11   |
| 49     | 6093  | 341.5    | 497.15   |
| 50     | 6012  | 364.29   | 578.05   |
| 51     | 5999  | 536.58   | 829.95   |
| 52     | 5924  | 336.38   | 658.43   |
| 53     | 6110  | 633.86   | 930.3    |
| 54     | 6059  | 396.03   | 605.7    |
| 55     | 6095  | 312.58   | 769.02   |
| 56     | 5920  | 261.63   | 404.74   |
| 57     | 6052  | 382.21   | 622.59   |
| 58     | 5871  | 306.69   | 502.78   |
| 59     | 5949  | 350.98   | 861.18   |
| 60     | 6017  | 335.87   | 539.65   |
| 61     | 5812  | 439.81   | 700.93   |
| 62     | 4079  | 472.06   | 755.71   |
| 63     | 135   | 36.32    | 47.3     |

### attempt.heartbeat

| Minute | Count | p95 ms   | p99 ms   |
| ------ | ----- | -------- | -------- |
| 0      | 242   | 5484.54  | 6053.89  |
| 1      | 1017  | 11911.17 | 12320.77 |
| 2      | 2217  | 10379.26 | 10805.25 |
| 3      | 2034  | 2721.79  | 2969.6   |
| 4      | 2001  | 262.4    | 722.94   |
| 5      | 2000  | 156.93   | 293.12   |
| 6      | 2000  | 161.54   | 451.33   |
| 7      | 1314  | 29999.1  | 30343.17 |
| 8      | 1802  | 30638.08 | 31703.04 |
| 9      | 1766  | 34144.26 | 34504.7  |
| 10     | 1993  | 38895.62 | 43286.53 |
| 11     | 2908  | 41353.22 | 45875.2  |
| 12     | 2041  | 10338.3  | 10682.37 |
| 13     | 2000  | 564.74   | 679.94   |
| 14     | 2000  | 734.21   | 781.31   |
| 15     | 2000  | 669.7    | 849.92   |
| 16     | 2000  | 508.16   | 680.45   |
| 17     | 2000  | 584.19   | 676.35   |
| 18     | 2000  | 745.47   | 823.81   |
| 19     | 2000  | 730.62   | 934.4    |
| 20     | 2000  | 711.68   | 763.39   |
| 21     | 2000  | 813.06   | 967.17   |
| 22     | 2000  | 704.51   | 749.57   |
| 23     | 2000  | 713.73   | 826.37   |
| 24     | 2000  | 788.99   | 827.9    |
| 25     | 2000  | 559.62   | 602.11   |
| 26     | 2000  | 464.9    | 741.89   |
| 27     | 2000  | 860.67   | 1009.15  |
| 28     | 2000  | 724.99   | 881.66   |
| 29     | 2000  | 742.4    | 776.19   |
| 30     | 2000  | 1004.03  | 1130.5   |
| 31     | 2000  | 605.18   | 671.23   |
| 32     | 2000  | 807.42   | 992.77   |
| 33     | 2000  | 962.56   | 1041.41  |
| 34     | 2000  | 812.03   | 981.5    |
| 35     | 2000  | 871.42   | 953.34   |
| 36     | 2000  | 1034.24  | 1333.25  |
| 37     | 2000  | 1192.96  | 1323.01  |
| 38     | 2000  | 1071.1   | 1178.62  |
| 39     | 2000  | 1112.06  | 1233.92  |
| 40     | 2000  | 894.46   | 993.28   |
| 41     | 2000  | 1059.84  | 1338.37  |
| 42     | 2000  | 843.78   | 1012.22  |
| 43     | 2000  | 909.31   | 1002.5   |
| 44     | 2000  | 1010.69  | 1055.74  |
| 45     | 2000  | 1090.56  | 1179.65  |
| 46     | 2000  | 892.93   | 1104.9   |
| 47     | 2000  | 744.45   | 779.26   |
| 48     | 2000  | 631.3    | 801.28   |
| 49     | 2000  | 612.86   | 692.22   |
| 50     | 2000  | 737.79   | 781.31   |
| 51     | 2000  | 935.94   | 1103.87  |
| 52     | 2000  | 813.57   | 854.02   |
| 53     | 2000  | 1041.41  | 1201.15  |
| 54     | 2000  | 753.15   | 817.15   |
| 55     | 2000  | 917.5    | 1005.57  |
| 56     | 2000  | 493.57   | 549.89   |
| 57     | 2000  | 684.54   | 798.72   |
| 58     | 2000  | 653.82   | 821.76   |
| 59     | 2000  | 961.02   | 1145.86  |
| 60     | 2000  | 629.76   | 712.7    |
| 61     | 2000  | 801.79   | 988.67   |
| 62     | 1401  | 661.5    | 941.57   |
| 63     | 27    | 57.15    | 59.14    |

## Top statements by total time (pg_stat_statements)

| Calls   | Total ms | Mean ms | Query                                                                                                                                                              |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 368497  | 96250    | 0.261   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 368497  | 65168    | 0.177   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 3276    | 18964    | 5.789   | `SELECT "public"."exam_attempts"."id" FROM "public"."exam_attempts" WHERE ("public"."exam_attempts"."school_id" = $1 AND "public"."exam_attempts"."state" = CAST(` |
| 484288  | 16302    | 0.034   | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 13000   | 15685    | 1.207   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."student_profile_id", "public"."exam_attempts"."state"::text FROM "public"."exam_attempts" WHERE ` |
| 484288  | 14575    | 0.03    | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 485288  | 13828    | 0.028   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 484288  | 13521    | 0.028   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 13000   | 12486    | 0.96    | `SELECT "public"."exam_session_participants"."id", "public"."exam_session_participants"."student_profile_id", "public"."exam_session_participants"."exam_session_` |
| 1691394 | 11471    | 0.007   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 482532  | 10679    | 0.022   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."user_id", "public"."school_memberships"."school_id" FROM "public"."school_memberships"` |
| 482532  | 10651    | 0.022   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id" FROM "public"."student_profiles" W` |
| 117239  | 9743     | 0.083   | `UPDATE "public"."exam_attempts" SET "last_seen_at" = $1, "updated_at" = $2 WHERE ("public"."exam_attempts"."school_id" = $3 AND "public"."exam_attempts"."id" = ` |
| 342939  | 9731     | 0.028   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."state"::text, "public"."exam_attempts"."expires_at", "publ` |
| 13000   | 9358     | 0.72    | `SELECT "public"."exam_participations"."id", "public"."exam_participations"."student_profile_id", "public"."exam_participations"."exam_session_id", "public"."exa` |

## Additional measurements

```json
{
  "sessionOpenMs": [2250, 2310, 1816, 1992, 1858],
  "markingDrainSeconds": 3.3,
  "studentsSawResult": "1000/1000"
}
```

## Notes

- Client-side sync errors (5185): batch 500 | batch network: timeout after 30000ms | batch network: read ECONNRESET
