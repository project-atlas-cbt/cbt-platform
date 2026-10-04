# ADR-0021 — Offline delivery of private question media

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** R-06 (HIGH), X-10 (HIGH)
**Blocks phases:** B4, B13

## Context

Two requirements pull in opposite directions.

`09 §22` requires question media in a private bucket with _"short-lived authorized access"_, and `09 §34` is emphatic: _"We should never simply put `/question-images/exam-question-17.jpg` on a public URL during a live examination."_

`08 §12.1` simultaneously requires that a student can _"read already-authorized question snapshots"_ while offline.

A short-lived signed URL expires. A student who goes offline for twenty minutes returns to broken images — and `01 §43` establishes that images, diagrams and equations are essential for Nigerian secondary-school papers, where the diagram often _is_ the question. This is not an edge case.

## Options considered

1. **Signed URLs fetched on demand** — breaks offline, which is the product's central resilience claim.
2. **Public media URLs** — violates `09 §34` and leaks exam content.
3. **Long-lived signed URLs** — weakens access control and still expires eventually.
4. **Fetch and cache media into the client at attempt start.**

## Decision

**Cache media into the client as part of the attempt package, at start, while the student is definitionally online.**

- On attempt start, the client downloads every media asset referenced by the snapshot into browser Cache Storage via the service worker (`09 §10`).
- Signed URLs need only outlive that initial download, so they stay short-lived.
- Offline reads hit the local cache, never the network.
- The start flow **reports media-download progress and blocks "Start" until essential media is cached** — the student's timer must not begin while assets are still arriving.
- The cache is scoped to the attempt and cleared on finalisation.
- Media remains private: the bucket stays non-public, and access is authorised per request during the download window.

## Consequences

**Easier**

- Media-bearing questions work offline, preserving the resilience claim.
- Access control is unchanged — no public URLs, no long-lived tokens.

**Harder**

- The attempt package grows by the size of its media, which bounds practical exam size and interacts with `R-09`'s constrained-network concern. B4 should surface size guidance to teachers at upload time, and B21 must test a media-heavy exam under a lab burst.
- "Start" now has a preparation step, which is a real UI requirement for F13, not a detail.
- A cache eviction mid-attempt would break images; the client must detect and re-fetch when online.

**Required changes**

- B4: media size guidance at upload; the attempt-package media contract.
- B13: media manifest in the attempt package; download-before-start; cache scoping and cleanup.
- B21: media-heavy exam under the 40-client lab burst.
- F13: download progress UI; Start blocked until cached; re-fetch on eviction; offline media browser test.

## Amendment — 2026-10-04 (F20): encrypted pre-cache before the exam window

Recorded here rather than rewriting the decision above. Owner decision 2026-10-03.

**Why.** B21 measured the cost of "download at start" on a real lab link
([capacity plan](../performance/capacity-plan.md) §9): a 40-question paper with 150 KB images is
~6 MB per student, and 40 students on a shared 2 Mbit uplink need ~16 minutes to cache it. With
Start blocked until cached (above), a media-heavy paper could never meet the 60 s lab-burst budget —
3 of 40 students were ready after 224 s. The bandwidth arithmetic cannot be fixed server-side; the
download has to move out of the burst.

**Decision.** The paper's media is downloaded **encrypted, before the exam window**, and decrypted
locally at Start:

- When an exam session opens, the API encrypts every READY media asset the exam's fixed question
  revisions reference (BullMQ job in the API process; never paused by B21 load shedding — a lab
  cannot Start without it). Each copy is AES-256-GCM, layout `IV(12) ‖ ciphertext ‖ tag(16)`,
  stored in object storage beside the plaintext, with its size and SHA-256 recorded
  (`exam_media_ciphertexts`, tenant-scoped, RLS).
- The key is **per exam and derived, never stored**: `HKDF-SHA256(MEDIA_PRECACHE_SECRET, salt =
schoolId, info = "exam-media:v1:" + examId)`.
- The assessment preview calls `GET /v1/student/assessment/:examId/media-manifest` — only for an
  AUTHORIZED participant of an OPEN session of an OPEN exam (the same predicate that offers the exam
  at all; anything else is a 404) — and downloads every ciphertext into Cache Storage
  (`atlas-exam-media-enc-v1`), verifying each SHA-256. The manifest never carries the key.
- The key reaches a student **only inside their own attempt package**, and only while the attempt is
  `IN_PROGRESS`. At Start the client decrypts each pre-cached asset into the ordinary F13 media cache
  (`atlas-exam-media-v1`), marks it cached in the attempt's manifest, and deletes the ciphertext.
  Rendering code is unchanged.
- Anything not pre-cached — an asset whose ciphertext is missing, fails authentication, or a machine
  without a secure context — falls back to the original rule above: fetched at Start, Start blocked
  until cached. The pre-cache is an accelerator, never a new failure mode.
- Ciphertext is operational data: once an exam can no longer admit an attempt (COMPLETED, ARCHIVED,
  CANCELLED), an hourly pass deletes the objects and rows. The plaintext asset remains the record.
  The client deletes an exam's ciphertext with the attempt's other local data at finalisation.

**Threat reasoning.**

- _What it protects:_ a student viewing the paper's media on a lab machine before their own timer
  starts. Ciphertext without the key is useless; the key is released only at Start.
- _Why one key per exam, not per student:_ question pools are deferred (ADR-0002), so every student
  sees the same media. A student who has started can already see that media; handing the key to one
  who has not requires the same collusion that leaks the content itself. Per-student keys would need
  per-student ciphertext — 40 times the storage and egress for no added protection.
- _Shared lab computers:_ only ciphertext persists between sittings until Start; after Start the
  plaintext copy is the F13 cache, scoped to the attempt and cleared at finalisation, as before.
- _Secret handling:_ `MEDIA_PRECACHE_SECRET` is mandatory in production (config refuses to boot
  without it, or if it reuses another secret) and is a B23 launch secret. Rotating it while an exam
  is live makes existing ciphertext undecryptable: clients fall back to the Start-time download
  (slower, never wrong). Rotate between exam windows.

**Measured** (lab burst, 40 clients, 40 × 150 KB paper, `ng-congested`; see the F20 entry in
`CHANGE-LOG.md` and `docs/performance/results/2026-10-04T02-47-02-lab-burst-ng-congested-media150-precached.*`):
Pre-cached lab burst, 40 clients, 40 × 150 KB paper, `ng-congested` (user-space relay): pre-cache of the whole lab **1,019 s (~17 min) for 246 MB**, all 1,600 downloads verified (37 expired URLs re-signed); at the bell **all 40 ready in 21.2 s** (20 s arrival window; per-student ≤ 1.9 s, start p95 1.5 s), no media fetched live, answer saves 100 %. B21's same link without pre-cache: 3 of 40 ready after 224 s. Signed ciphertext URLs live 15 minutes, which a congested lab outlasts; the client re-signs them from the manifest on expiry.

**Consequences.** A lab needs its session opened early enough for the pre-cache to finish — the
download is the same ~16 minutes on a 2 Mbit link, but it is now spent while students sit at the
preview rather than on their timers. The preview shows progress and holds Start until the pre-cache
(or the fallback) completes.
