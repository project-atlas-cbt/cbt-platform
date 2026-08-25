# ADR-0030 — Printable reporting via browser print

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** A-13 (LOW)
**Blocks phases:** B18, F18

## Context

`02`'s matrix grants "Generate printable reports" to five roles, and to Student as "Own result if enabled". `01 §25` lists PDF as _"potentially later"_. `05` specifies CSV in detail (`§54`) and never mentions PDF.

Browser print stylesheets and server-side PDF generation are very different amounts of work: the latter needs a rendering dependency, a worker queue, and object storage for the artefacts.

## Decision

**Browser print stylesheets for the initial release.**

- Dedicated `/print/*` routes with print-optimised layouts.
- Satisfies "printable" without a PDF pipeline.
- **CSV remains the specified export format** (`05 §54`), including its requirement that academic statuses such as `ABSENT` are preserved rather than converted to zeros.
- Server-rendered PDF is an **approved deferral**.

## Consequences

**Easier**

- No rendering dependency, worker queue, or artefact storage in the initial release.
- Print layouts are ordinary CSS, testable in the browser suite.

**Harder**

- Output fidelity depends on the user's browser and printer settings; a school wanting a byte-identical archival document does not get one.
- Emailing a report is not possible without a PDF artefact — acceptable, since no specification requires it.
- If schools ask for official result sheets during the pilot, PDF moves from deferred to required, and B18 grows a rendering pipeline.

**Required changes**

- B18: no PDF pipeline; CSV export only.
- F18: `/print/*` routes with print stylesheets, verified in the target browsers.
- B23: watch for pilot feedback on printed-output fidelity.
