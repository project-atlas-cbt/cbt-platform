# B21 lab burst: 40 clients behind one link

**Scenario:** `lab-burst` · **Started:** 2026-10-03T09:14:55.637Z · **Duration:** 91s · **Budgets:** all met

## Environment

| Key         | Value                                                  |
| ----------- | ------------------------------------------------------ |
| host        | DESKTOP-2S8H6BV                                        |
| platform    | win32 10.0.26200                                       |
| cpu         | 12th Gen Intel(R) Core(TM) i3-1215U                    |
| logicalCpus | 8                                                      |
| memoryGb    | 7.7                                                    |
| node        | v22.18.0                                               |
| network     | ng-typical (≈150 ms RTT ±40, ~1% loss) via netem relay |
| pooler      | none (direct)                                          |

## Parameters

```json
{
  "clients": 40,
  "arrivalWindowSeconds": 20,
  "questions": 40,
  "mediaKbPerQuestion": 150
}
```

## Budget checks

| Check                                            | Actual   | Budget  | Result |
| ------------------------------------------------ | -------- | ------- | ------ |
| clients ready (signed in, started, media cached) | 40/40    | 40      | PASS   |
| whole lab ready (first arrival → last ready)     | 56.1 s   | ≤ 60 s  | PASS   |
| answer save success                              | 100.000% | ≥ 99.9% | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms   | p95 ms   | p99 ms   | max ms   |
| ------------------ | ----- | ---- | -------------- | -------- | -------- | -------- | -------- | -------- |
| answer.batch       | 145   | 145  | —              | 0        | 235.01   | 309.25   | 512.77   | 2936.83  |
| attempt.heartbeat  | 40    | 40   | —              | 0        | 229.89   | 290.3    | 438.27   | 438.27   |
| attempt.start      | 40    | 40   | —              | 0        | 1760.26  | 2752.51  | 2957.31  | 2957.31  |
| auth.login         | 41    | 41   | —              | 0        | 500.74   | 889.34   | 1067.01  | 1067.01  |
| media.get          | 1600  | 1600 | —              | 0        | 15933.44 | 29278.21 | 31047.68 | 32227.33 |
| session.open       | 1     | 1    | —              | 0        | 788.48   | 788.48   | 788.48   | 788.48   |
| student.assessment | 40    | 40   | —              | 0        | 380.67   | 690.69   | 892.42   | 892.42   |
| student.preview    | 40    | 40   | —              | 0        | 518.91   | 986.62   | 1210.37  | 1210.37  |
| tenant.resolve     | 41    | 41   | —              | 0        | 489.47   | 745.47   | 804.35   | 804.35   |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 19    |
| peakConnections       | 12    |
| peakActive            | 4     |
| peakIdleInTransaction | 3     |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 89    |
| peakCommitsPerSecond  | 217   |
| peakRedisClients      | 56    |
| peakRedisMemoryMb     | 15.7  |
| minHostFreeMemoryMb   | 591   |
| hostMemoryPressure    | false |

## Additional measurements

```json
{
  "perClientReadyP95Seconds": 36.6,
  "perClientReadyMaxSeconds": 37.6,
  "mediaBytesTransferred": 245707200,
  "mediaFiles": 1600
}
```
