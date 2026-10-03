# B21 levels: 1000 concurrent attempts

**Scenario:** `levels` · **Started:** 2026-10-03T11:06:00.899Z · **Duration:** 3751s · **Budgets:** NOT met

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
  "offeredAnswerChangesPerSecond": 100
}
```

## Budget checks

| Check                     | Actual     | Budget       | Result |
| ------------------------- | ---------- | ------------ | ------ |
| starts failed             | 0          | 0            | PASS   |
| answer save p95           | 163.2 ms   | ≤ 250 ms     | PASS   |
| answer save p99           | 2422.78 ms | ≤ 750 ms     | FAIL   |
| answer save success       | 100.000%   | ≥ 99.9%      | PASS   |
| start p95                 | 6430.72 ms | ≤ 2000 ms    | FAIL   |
| submit p95                | 6496.26 ms | ≤ 2000 ms    | FAIL   |
| submits accepted          | 1000/1000  | 1000         | PASS   |
| attempts created          | 1000       | exactly 1000 | PASS   |
| duplicate attempts        | 0          | 0            | PASS   |
| results produced          | 1000       | exactly 1000 | PASS   |
| acknowledged answers lost | 0 of 40000 | 0            | PASS   |

## Latency by operation (client-observed)

| Operation          | Count  | 2xx    | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ------ | ------ | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 366425 | 366425 | —              | 0        | 31.97   | 163.2   | 2422.78 | 5140.48 |
| attempt.event      | 17969  | 17969  | —              | 0        | 26.99   | 107.97  | 1233.92 | 4890.62 |
| attempt.heartbeat  | 122249 | 122249 | —              | 0        | 32.74   | 180.61  | 3239.94 | 6311.94 |
| attempt.start      | 1000   | 1000   | —              | 0        | 3102.72 | 6430.72 | 6668.29 | 6803.46 |
| attempt.status     | 1000   | 1000   | —              | 0        | 4044.8  | 4423.68 | 4493.31 | 4505.6  |
| attempt.submit     | 1000   | 1000   | —              | 0        | 240     | 6496.26 | 7290.88 | 7512.06 |
| auth.login         | 1005   | 1005   | —              | 0        | 1613.82 | 5324.8  | 5541.89 | 5693.44 |
| session.open       | 5      | 5      | —              | 0        | 1372.16 | 1419.26 | 1419.26 | 1419.26 |
| student.assessment | 1000   | 1000   | —              | 0        | 1013.25 | 3135.49 | 3596.29 | 3680.26 |
| student.preview    | 1000   | 1000   | —              | 0        | 938.5   | 2213.89 | 2332.67 | 2398.21 |
| tenant.resolve     | 1005   | 1005   | —              | 0        | 372.22  | 1291.26 | 1418.24 | 1494.02 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 750   |
| peakConnections       | 45    |
| peakActive            | 5     |
| peakIdleInTransaction | 37    |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 617   |
| peakCommitsPerSecond  | 828   |
| peakRedisClients      | 75    |
| peakRedisMemoryMb     | 373.6 |
| minHostFreeMemoryMb   | 12117 |
| hostMemoryPressure    | false |

## Correctness verification (database)

| Exam     | Expected | Attempts | Distinct students | Duplicates | States        | Results | Final | Answers checked | Lost/mismatched |
| -------- | -------- | -------- | ----------------- | ---------- | ------------- | ------- | ----- | --------------- | --------------- |
| 01a10171 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10171 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10171 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10171 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |
| 01a10171 | 200      | 200      | 200               | 0          | SUBMITTED:200 | 200     | 200   | 8000            | 0               |

## Storage growth (1000 attempts)

| Table                      | Rows added | Bytes added | Bytes / attempt |
| -------------------------- | ---------- | ----------- | --------------- |
| exam_attempts              | 1000       | 1261568     | 1262            |
| attempt_question_snapshots | 1000       | 10289152    | 10289           |
| attempt_answers            | 40000      | 12582912    | 12583           |
| attempt_answer_events      | 368815     | 77504512    | 77505           |
| attempt_question_results   | 60000      | 17448960    | 17449           |
| attempt_events             | 17969      | 2973696     | 2974            |
| results                    | 1500       | 1294336     | 1294            |
| exam_session_participants  | 1500       | 442368      | 442             |
| exam_participations        | 1000       | 155648      | 156             |
| audit_events               | 3535       | 2064384     | 2064            |

## Drift over time (per minute)

### answer.batch

| Minute | Count | p95 ms  | p99 ms  |
| ------ | ----- | ------- | ------- |
| 0      | 1829  | 1954.82 | 2077.7  |
| 1      | 5629  | 2783.23 | 2928.64 |
| 2      | 5978  | 74.94   | 115.78  |
| 3      | 6038  | 88.96   | 189.82  |
| 4      | 5945  | 69.95   | 102.72  |
| 5      | 6082  | 97.79   | 272.38  |
| 6      | 6030  | 262.66  | 833.02  |
| 7      | 5970  | 95.36   | 242.69  |
| 8      | 6081  | 90.56   | 207.1   |
| 9      | 5855  | 91.33   | 157.95  |
| 10     | 5967  | 71.74   | 117.57  |
| 11     | 6112  | 89.09   | 275.71  |
| 12     | 5949  | 254.21  | 469.76  |
| 13     | 5888  | 72.13   | 132.86  |
| 14     | 5959  | 89.73   | 141.82  |
| 15     | 6049  | 100.22  | 214.53  |
| 16     | 6145  | 179.07  | 312.83  |
| 17     | 6120  | 91.14   | 186.11  |
| 18     | 6037  | 73.47   | 122.56  |
| 19     | 5975  | 110.46  | 290.3   |
| 20     | 6106  | 98.56   | 287.23  |
| 21     | 5914  | 116.48  | 331.78  |
| 22     | 6146  | 95.04   | 216.7   |
| 23     | 5919  | 65.44   | 124.74  |
| 24     | 6002  | 65.28   | 113.6   |
| 25     | 6083  | 67.71   | 142.21  |
| 26     | 6016  | 67.14   | 107.58  |
| 27     | 5989  | 73.34   | 222.08  |
| 28     | 5998  | 103.1   | 369.92  |
| 29     | 6059  | 91.26   | 177.28  |
| 30     | 5921  | 155.52  | 441.86  |
| 31     | 6084  | 120.19  | 253.7   |
| 32     | 5967  | 86.46   | 154.24  |
| 33     | 6021  | 60.99   | 152.06  |
| 34     | 6095  | 113.41  | 209.28  |
| 35     | 6013  | 71.04   | 146.18  |
| 36     | 6058  | 99.01   | 184.32  |
| 37     | 6005  | 79.74   | 136.96  |
| 38     | 6053  | 74.3    | 121.47  |
| 39     | 6065  | 105.98  | 174.72  |
| 40     | 5894  | 82.3    | 130.43  |
| 41     | 5998  | 69.38   | 108.03  |
| 42     | 5954  | 70.78   | 136.83  |
| 43     | 5844  | 76.1    | 140.54  |
| 44     | 5160  | 4325.38 | 4829.18 |
| 45     | 6208  | 4685.82 | 4829.18 |
| 46     | 6001  | 146.3   | 272.13  |
| 47     | 6066  | 182.91  | 517.89  |
| 48     | 6002  | 161.41  | 270.85  |
| 49     | 5951  | 169.73  | 725.5   |
| 50     | 5979  | 96.45   | 181.25  |
| 51     | 5964  | 80.64   | 120.13  |
| 52     | 6008  | 94.46   | 201.73  |
| 53     | 5998  | 103.3   | 196.86  |
| 54     | 5997  | 83.26   | 162.82  |
| 55     | 5925  | 106.75  | 209.15  |
| 56     | 5768  | 1344.51 | 1469.44 |
| 57     | 6072  | 1061.89 | 1235.97 |
| 58     | 6073  | 64.06   | 102.98  |
| 59     | 6016  | 135.3   | 265.73  |
| 60     | 6098  | 173.82  | 271.87  |
| 61     | 4714  | 4108.29 | 4829.18 |
| 62     | 583   | 261.63  | 658.94  |

### attempt.heartbeat

| Minute | Count | p95 ms  | p99 ms  |
| ------ | ----- | ------- | ------- |
| 0      | 533   | 2375.68 | 2498.56 |
| 1      | 1896  | 3434.5  | 3592.19 |
| 2      | 2000  | 76.99   | 132.35  |
| 3      | 2000  | 87.74   | 196.86  |
| 4      | 2000  | 70.21   | 99.58   |
| 5      | 2000  | 115.2   | 285.95  |
| 6      | 2000  | 242.56  | 899.58  |
| 7      | 2000  | 94.91   | 251.65  |
| 8      | 2000  | 95.17   | 200.83  |
| 9      | 2000  | 91.84   | 201.09  |
| 10     | 2000  | 77.31   | 127.74  |
| 11     | 2000  | 99.78   | 268.8   |
| 12     | 1998  | 249.09  | 553.98  |
| 13     | 2002  | 78.98   | 146.56  |
| 14     | 2000  | 91.65   | 138.62  |
| 15     | 2000  | 98.69   | 217.47  |
| 16     | 2000  | 194.94  | 335.87  |
| 17     | 2000  | 110.27  | 211.97  |
| 18     | 2000  | 77.63   | 132.99  |
| 19     | 1974  | 108.22  | 232.96  |
| 20     | 2026  | 114.05  | 634.37  |
| 21     | 2000  | 111.74  | 432.9   |
| 22     | 2000  | 97.66   | 224.77  |
| 23     | 2000  | 68.22   | 231.04  |
| 24     | 2000  | 64.96   | 115.9   |
| 25     | 2000  | 70.34   | 198.66  |
| 26     | 2000  | 71.74   | 110.14  |
| 27     | 2000  | 78.34   | 267.26  |
| 28     | 2000  | 105.28  | 331.78  |
| 29     | 2000  | 88.64   | 178.56  |
| 30     | 2000  | 183.55  | 376.06  |
| 31     | 2000  | 125.5   | 220.42  |
| 32     | 2000  | 86.02   | 170.5   |
| 33     | 2000  | 64.8    | 152.96  |
| 34     | 2000  | 116.29  | 217.22  |
| 35     | 2000  | 77.18   | 153.47  |
| 36     | 1999  | 97.15   | 174.72  |
| 37     | 2001  | 83.33   | 143.36  |
| 38     | 2000  | 82.82   | 147.84  |
| 39     | 2000  | 104.45  | 210.05  |
| 40     | 1998  | 83.07   | 133.38  |
| 41     | 2002  | 71.36   | 116.29  |
| 42     | 2000  | 73.28   | 135.42  |
| 43     | 2000  | 80.83   | 150.78  |
| 44     | 1802  | 5472.26 | 6029.31 |
| 45     | 2197  | 5783.55 | 5931.01 |
| 46     | 2000  | 142.34  | 280.83  |
| 47     | 2001  | 180.22  | 614.91  |
| 48     | 2000  | 154.37  | 279.81  |
| 49     | 2000  | 172.29  | 907.78  |
| 50     | 1999  | 107.07  | 196.1   |
| 51     | 2001  | 82.5    | 120.58  |
| 52     | 2000  | 96.19   | 224.64  |
| 53     | 2000  | 113.02  | 201.6   |
| 54     | 1999  | 83.71   | 173.31  |
| 55     | 2001  | 104.19  | 184.7   |
| 56     | 1979  | 1624.06 | 1752.06 |
| 57     | 2021  | 1233.92 | 1438.72 |
| 58     | 1998  | 72.83   | 113.73  |
| 59     | 2000  | 134.02  | 267.52  |
| 60     | 2000  | 201.22  | 290.3   |
| 61     | 1634  | 5218.3  | 5992.45 |
| 62     | 188   | 217.09  | 762.37  |

## Top statements by total time (pg_stat_statements)

| Calls   | Total ms | Mean ms | Query                                                                                                                                                              |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 368815  | 86061    | 0.233   | `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_f` |
| 368815  | 62143    | 0.168   | `INSERT INTO "public"."attempt_answer_events" ("school_id","attempt_id","exam_question_id","sequence_number","selected_option_id","received_at","source","grade_w` |
| 511643  | 17160    | 0.034   | `SELECT "public"."sessions"."id", "public"."sessions"."school_id", "public"."sessions"."user_id", "public"."sessions"."token_hash", "public"."sessions"."created_` |
| 511643  | 14946    | 0.029   | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."school_id", "public"."school_memberships"."user_id", "public"."school_memberships"."lo` |
| 511643  | 14305    | 0.028   | `SELECT "public"."role_assignments"."id", "public"."role_assignments"."school_id", "public"."role_assignments"."membership_id", "public"."role_assignments"."role` |
| 512643  | 13783    | 0.027   | `SELECT "public"."users"."id", "public"."users"."first_name", "public"."users"."last_name", "public"."users"."display_name", "public"."users"."email", "public"."` |
| 1789220 | 12653    | 0.007   | `SELECT set_config($1, $2, $3)`                                                                                                                                    |
| 60000   | 12199    | 0.203   | `INSERT INTO "public"."attempt_question_results" ("school_id","attempt_id","exam_question_id","correctness","awarded_marks","maximum_marks","created_at","updated` |
| 512647  | 11033    | 0.022   | `SELECT "public"."student_profiles"."id", "public"."student_profiles"."school_id", "public"."student_profiles"."membership_id" FROM "public"."student_profiles" W` |
| 366425  | 10921    | 0.03    | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."state"::text, "public"."exam_attempts"."expires_at", "publ` |
| 512647  | 10489    | 0.02    | `SELECT "public"."school_memberships"."id", "public"."school_memberships"."user_id", "public"."school_memberships"."school_id" FROM "public"."school_memberships"` |
| 122249  | 8087     | 0.066   | `UPDATE "public"."exam_attempts" SET "last_seen_at" = $1, "updated_at" = $2 WHERE ("public"."exam_attempts"."school_id" = $3 AND "public"."exam_attempts"."id" = ` |
| 513643  | 7842     | 0.015   | `SELECT "public"."schools"."id", "public"."schools"."platform_override"::text FROM "public"."schools" WHERE ("public"."schools"."subdomain" = $1 AND $4=$5) LIMIT` |
| 95720   | 6246     | 0.065   | `UPDATE "public"."exam_attempts" SET "last_seen_at" = $1, "updated_at" = $2 WHERE ("public"."exam_attempts"."school_id" = $3 AND "public"."exam_attempts"."id" = ` |
| 144218  | 5287     | 0.037   | `SELECT "public"."exam_attempts"."id", "public"."exam_attempts"."school_id", "public"."exam_attempts"."exam_id", "public"."exam_attempts"."exam_session_id", "pub` |

## Additional measurements

```json
{
  "sessionOpenMs": [1192, 1419, 1411, 1190, 1373],
  "markingDrainSeconds": 4.5,
  "studentsSawResult": "1000/1000"
}
```
