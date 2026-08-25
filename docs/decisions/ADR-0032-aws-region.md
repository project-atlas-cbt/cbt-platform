# ADR-0032 — AWS region and latency posture

**Status:** Accepted (validate with measurement at B21)
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** R-08 (HIGH), R-09 (MEDIUM)
**Blocks phases:** B0, B21, B23

## Context

`09` selects AWS for the API, database and Redis, and Vercel for the web tier, but names **no region**. Latency lands directly on the product's hot path: every answer save is a round trip (`09 §45`), and `08 §20`'s write-pressure model assumes those complete quickly.

`01 §10` names the operating environment precisely — unstable electricity, unstable internet, shared labs, old computers, network congestion. On a congested school network with 150 ms base RTT, a save-per-change design feels sluggish and widens the window in which an answer is unsynchronised when connectivity drops.

## Options considered

| Region                 | Consideration                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `af-south-1` Cape Town | Geographically closest, but Lagos→Cape Town routing is often no faster than Lagos→Europe in practice. Smaller service catalogue, higher pricing. |
| `eu-west-1` Ireland    | Common choice for West African traffic, ~80–150 ms RTT. Full catalogue, mature pricing.                                                          |
| `eu-west-2` London     | Comparable latency; relevant if residency or commercial preference favours the UK.                                                               |

## Decision

**`eu-west-1` (Ireland)**, validated by measurement in B21.

Chosen for the full service catalogue, mature pricing, and established West African routing. B0 needs a region to provision into, and this is the interim-and-likely-final answer rather than a placeholder.

### Latency posture — the more important half

The region choice matters less than designing so latency does not govern the student's experience:

- **The client batches and debounces answer writes.** The local IndexedDB write is what the student perceives; the network write is asynchronous confirmation. `08 §12.1` already permits exactly this.
- Perceived responsiveness must not depend on RTT.
- B21 tests under **simulated latency and packet loss**, not only clean-network load, and includes the 40-client lab burst on a constrained link (`R-09`).
- Service-worker precaching means a second sitting on the same machine loads from cache.

## Consequences

**Easier**

- All stack services are available with predictable pricing.
- One region keeps the topology simple, consistent with `09`'s single-region baseline.

**Harder**

- Nigerian students are ~80–150 ms from the API, so the offline-first client design is load-bearing rather than a nice-to-have.
- Data residency in Nigeria is not achieved; if a customer requires it, that is a material change ([ADR-0028](./ADR-0028-data-protection-and-retention.md)).

**Required changes**

- B0: provision into `eu-west-1`.
- B13/F13: batching and debouncing so the student never waits on a round trip.
- B21: measured RTT from representative Nigerian networks; latency and packet-loss profiles; lab burst.
- B23: capacity plan reflecting measured latency.

## Revisiting

If B21 shows `eu-west-1` RTT is materially worse than `af-south-1` from real Nigerian school networks, this ADR is amended before B23 provisions production.
