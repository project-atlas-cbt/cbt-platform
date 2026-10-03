# B21 lab burst: 40 clients behind one link

**Scenario:** `lab-burst` · **Started:** 2026-10-03T09:18:56.244Z · **Duration:** 274s · **Budgets:** NOT met

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
  "mediaKbPerQuestion": 150
}
```

> **Host memory pressure:** free RAM fell to 81 MB during this run, so the host was paging. Latency figures here measure the workstation's page file, not the platform; correctness checks remain valid.

## Budget checks

| Check                                            | Actual  | Budget  | Result |
| ------------------------------------------------ | ------- | ------- | ------ |
| clients ready (signed in, started, media cached) | 3/40    | 40      | FAIL   |
| whole lab ready (first arrival → last ready)     | 224.4 s | ≤ 60 s  | FAIL   |
| answer save success                              | 0.000%  | ≥ 99.9% | FAIL   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx | Other statuses | Net fail | p50 ms    | p95 ms    | p99 ms    | max ms    |
| ------------------ | ----- | --- | -------------- | -------- | --------- | --------- | --------- | --------- |
| answer.batch       | 26    | 0   | —              | 26       | 30015.49  | 30031.87  | 30031.87  | 30031.87  |
| attempt.heartbeat  | 8     | 0   | —              | 8        | 30031.87  | 30031.87  | 30031.87  | 30031.87  |
| attempt.start      | 26    | 26  | —              | 0        | 14090.24  | 20611.07  | 21807.1   | 21807.1   |
| auth.login         | 27    | 27  | —              | 0        | 3362.82   | 7196.67   | 7610.37   | 7610.37   |
| media.get          | 543   | 329 | —              | 214      | 120061.95 | 207224.83 | 231473.15 | 240648.19 |
| session.open       | 1     | 1   | —              | 0        | 1323.01   | 1323.01   | 1323.01   | 1323.01   |
| student.assessment | 26    | 26  | —              | 0        | 4159.49   | 6352.9    | 7135.23   | 7135.23   |
| student.preview    | 26    | 26  | —              | 0        | 4407.3    | 6791.17   | 7634.94   | 7634.94   |
| tenant.resolve     | 41    | 27  | —              | 14       | 14417.92  | 30015.49  | 30031.87  | 30031.87  |

## Server resources (sampled every 5 s)

| Metric                | Value |
| --------------------- | ----- |
| samples               | 54    |
| peakConnections       | 8     |
| peakActive            | 2     |
| peakIdleInTransaction | 3     |
| peakWaitingLocks      | 0     |
| avgCommitsPerSecond   | 24    |
| peakCommitsPerSecond  | 112   |
| peakRedisClients      | 56    |
| peakRedisMemoryMb     | 17.1  |
| minHostFreeMemoryMb   | 81    |
| hostMemoryPressure    | true  |

## Additional measurements

```json
{
  "perClientReadyP95Seconds": 221.4,
  "perClientReadyMaxSeconds": 221.4,
  "mediaBytesTransferred": 50523543,
  "mediaFiles": 543
}
```

## Notes

- Failures: timeout after 30000ms | media timeout | socket hang up
