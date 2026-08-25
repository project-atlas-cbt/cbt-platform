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
