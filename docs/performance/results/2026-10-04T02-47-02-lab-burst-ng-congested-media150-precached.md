# F20 lab burst (pre-cached): 40 clients press Start behind one link

**Scenario:** `lab-burst` · **Started:** 2026-10-04T02:47:02.746Z · **Duration:** 1074s · **Budgets:** all met

## Environment

| Key         | Value                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| host        | vm                                                                                                                                                             |
| platform    | linux 6.18.44-fc-v64                                                                                                                                           |
| cpu         | Intel(R) Xeon(R) Processor @ 2.10GHz                                                                                                                           |
| logicalCpus | 4                                                                                                                                                              |
| memoryGb    | 15.7                                                                                                                                                           |
| node        | v22.22.0                                                                                                                                                       |
| network     | ng-congested (≈300 ms RTT ±100, ~3% loss, 2 Mbit shared, 1,000-packet queue) via user-space shaper (tools/load/netem/shaper.mjs — no sch_netem in this kernel) |
| pooler      | none (direct)                                                                                                                                                  |

## Parameters

```json
{
  "clients": 40,
  "arrivalWindowSeconds": 20,
  "questions": 40,
  "mediaKbPerQuestion": 150,
  "precache": true
}
```

## Budget checks

| Check                                                          | Actual         | Budget  | Result |
| -------------------------------------------------------------- | -------------- | ------- | ------ |
| clients pre-cached before the bell                             | 40/40          | 40      | PASS   |
| media at Start served from the pre-cache (no live media fetch) | 0 live fetches | 0       | PASS   |
| clients ready (signed in, started, media cached)               | 40/40          | 40      | PASS   |
| whole lab ready (first arrival → last ready)                   | 21.2 s         | ≤ 60 s  | PASS   |
| answer save success                                            | 100.000%       | ≥ 99.9% | PASS   |

## Latency by operation (client-observed)

| Operation          | Count | 2xx  | Other statuses | Net fail | p50 ms   | p95 ms   | p99 ms   | max ms   |
| ------------------ | ----- | ---- | -------------- | -------- | -------- | -------- | -------- | -------- |
| answer.batch       | 150   | 150  | —              | 0        | 332.29   | 461.82   | 898.56   | 1018.88  |
| attempt.heartbeat  | 40    | 40   | —              | 0        | 356.86   | 869.38   | 1050.62  | 1050.62  |
| attempt.start      | 40    | 40   | —              | 0        | 797.18   | 1537.02  | 1918.98  | 1918.98  |
| auth.login         | 41    | 41   | —              | 0        | 6475.78  | 8888.32  | 12222.46 | 12222.46 |
| media.precache     | 3105  | 1600 | 403×37         | 1468     | 12255.23 | 76939.26 | 77463.55 | 78118.91 |
| precache.manifest  | 70    | 70   | —              | 0        | 14114.82 | 19726.34 | 21069.82 | 23281.66 |
| session.open       | 1     | 1    | —              | 0        | 627.71   | 627.71   | 627.71   | 627.71   |
| student.assessment | 40    | 40   | —              | 0        | 8691.71  | 12156.93 | 12394.5  | 12394.5  |
| student.preview    | 40    | 40   | —              | 0        | 11509.76 | 12369.92 | 12926.98 | 12926.98 |
| tenant.resolve     | 41    | 41   | —              | 0        | 3921.92  | 7327.74  | 9379.84  | 9379.84  |

## Server resources (sampled every 5 s)

| Metric                 | Value |
| ---------------------- | ----- |
| samples                | 216   |
| peakConnections        | 7     |
| peakActive             | 2     |
| peakIdleInTransaction  | 1     |
| peakWaitingLocks       | 0     |
| avgCommitsPerSecond    | 3     |
| peakCommitsPerSecond   | 38    |
| peakRedisClients       | 23    |
| peakRedisMemoryMb      | 2.9   |
| minHostFreeMemoryMb    | 12983 |
| hostMemoryPressure     | false |
| peakHarnessLoopDelayMs | 105   |
| harnessStalls          |       |

## Additional measurements

```json
{
  "perClientReadyP95Seconds": 1.7,
  "perClientReadyMaxSeconds": 1.9,
  "mediaBytesTransferred": 0,
  "mediaFiles": 0,
  "precacheSeconds": 1019.2,
  "precacheBytes": 245752000,
  "studentsWithMediaKey": 40
}
```
