# B21 lab burst: 40 clients behind one link

**Scenario:** `lab-burst` · **Started:** 2026-10-03T09:17:39.404Z · **Duration:** 61s · **Budgets:** all met

## Environment

| Key         | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| host        | DESKTOP-2S8H6BV                                                          |
| platform    | win32 10.0.26200                                                         |
| cpu         | 12th Gen Intel(R) Core(TM) i3-1215U                                      |
| logicalCpus | 8                                                                        |
| memoryGb    | 7.7                                                                      |
| node        | v22.18.0                                                                 |
| network     | ng-congested (≈300 ms RTT ±100, ~3% loss, 2 Mbit shared) via netem relay |
| pooler      | none (direct)                                                            |

## Parameters

```json
{
  "clients": 40,
  "arrivalWindowSeconds": 20,
  "questions": 40,
  "mediaKbPerQuestion": 0
}
```

> **Host memory pressure:** free RAM fell to 249 MB during this run, so the host was paging. Latency figures here measure the workstation's page file, not the platform; correctness checks remain valid.

## Budget checks

| Check                                            | Actual   | Budget  | Result |
| ------------------------------------------------ | -------- | ------- | ------ |
| clients ready (signed in, started, media cached) | 40/40    | 40      | PASS   |
| whole lab ready (first arrival → last ready)     | 23.2 s   | ≤ 60 s  | PASS   |
| answer save success                              | 100.000% | ≥ 99.9% | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx | Other statuses | Net fail | p50 ms  | p95 ms  | p99 ms  | max ms  |
| ------------------ | ----- | --- | -------------- | -------- | ------- | ------- | ------- | ------- |
| answer.batch       | 139   | 139 | —              | 0        | 460.29  | 564.22  | 1087.49 | 1136.64 |
| attempt.heartbeat  | 40    | 40  | —              | 0        | 468.74  | 829.44  | 1031.17 | 1031.17 |
| attempt.start      | 40    | 40  | —              | 0        | 1176.58 | 1576.96 | 1816.58 | 1816.58 |
| auth.login         | 41    | 41  | —              | 0        | 575.49  | 660.99  | 735.74  | 735.74  |
| session.open       | 1     | 1   | —              | 0        | 1174.53 | 1174.53 | 1174.53 | 1174.53 |
| student.assessment | 40    | 40  | —              | 0        | 522.5   | 601.6   | 1183.74 | 1183.74 |
| student.preview    | 40    | 40  | —              | 0        | 564.74  | 665.09  | 1107.97 | 1107.97 |
| tenant.resolve     | 41    | 41  | —              | 0        | 1115.14 | 1828.86 | 2089.98 | 2089.98 |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 12    |
| peakConnections       | 8     |
| peakActive            | 2     |
| peakIdleInTransaction | 4     |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 95    |
| peakCommitsPerSecond  | 186   |
| peakRedisClients      | 56    |
| peakRedisMemoryMb     | 16.3  |
| minHostFreeMemoryMb   | 249   |
| hostMemoryPressure    | true  |

## Additional measurements

```json
{
  "perClientReadyP95Seconds": 4.8,
  "perClientReadyMaxSeconds": 5.4,
  "mediaBytesTransferred": 0,
  "mediaFiles": 0
}
```
