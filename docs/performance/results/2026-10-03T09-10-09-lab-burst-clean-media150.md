# B21 lab burst: 40 clients behind one link

**Scenario:** `lab-burst` · **Started:** 2026-10-03T09:10:09.547Z · **Duration:** 53s · **Budgets:** all met

## Environment

| Key         | Value                               |
| ----------- | ----------------------------------- |
| host        | DESKTOP-2S8H6BV                     |
| platform    | win32 10.0.26200                    |
| cpu         | 12th Gen Intel(R) Core(TM) i3-1215U |
| logicalCpus | 8                                   |
| memoryGb    | 7.7                                 |
| node        | v22.18.0                            |
| network     | clean (loopback)                    |
| pooler      | none (direct)                       |

## Parameters

```json
{
  "clients": 40,
  "arrivalWindowSeconds": 20,
  "questions": 40,
  "mediaKbPerQuestion": 150
}
```

> **Host memory pressure:** free RAM fell to 425 MB during this run, so the host was paging. Latency figures here measure the workstation's page file, not the platform; correctness checks remain valid.

## Budget checks

| Check                                            | Actual    | Budget   | Result |
| ------------------------------------------------ | --------- | -------- | ------ |
| clients ready (signed in, started, media cached) | 40/40     | 40       | PASS   |
| whole lab ready (first arrival → last ready)     | 20.5 s    | ≤ 60 s   | PASS   |
| answer save p95                                  | 97.92 ms  | ≤ 250 ms | PASS   |
| answer save p99                                  | 132.22 ms | ≤ 750 ms | PASS   |
| answer save success                              | 100.000%  | ≥ 99.9%  | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms | p95 ms | p99 ms | max ms |
| ------------------ | ----- | ---- | -------------- | -------- | ------ | ------ | ------ | ------ |
| answer.batch       | 138   | 138  | —              | 0        | 67.46  | 97.92  | 132.22 | 138.62 |
| attempt.heartbeat  | 40    | 40   | —              | 0        | 66.11  | 85.25  | 94.14  | 94.14  |
| attempt.start      | 40    | 40   | —              | 0        | 517.89 | 699.9  | 923.14 | 923.14 |
| auth.login         | 41    | 41   | —              | 0        | 204.42 | 343.81 | 415.23 | 415.23 |
| media.get          | 1600  | 1600 | —              | 0        | 99.14  | 201.98 | 360.19 | 426.5  |
| session.open       | 1     | 1    | —              | 0        | 669.18 | 669.18 | 669.18 | 669.18 |
| student.assessment | 40    | 40   | —              | 0        | 87.68  | 240.77 | 302.08 | 302.08 |
| student.preview    | 40    | 40   | —              | 0        | 144.64 | 326.66 | 481.02 | 481.02 |
| tenant.resolve     | 41    | 41   | —              | 0        | 23.84  | 101.95 | 147.84 | 147.84 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 12    |
| peakConnections       | 7     |
| peakActive            | 1     |
| peakIdleInTransaction | 4     |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 86    |
| peakCommitsPerSecond  | 165   |
| peakRedisClients      | 56    |
| peakRedisMemoryMb     | 15    |
| minHostFreeMemoryMb   | 425   |
| hostMemoryPressure    | true  |

## Additional measurements

```json
{
  "perClientReadyP95Seconds": 1.9,
  "perClientReadyMaxSeconds": 1.9,
  "mediaBytesTransferred": 245707200,
  "mediaFiles": 1600
}
```
