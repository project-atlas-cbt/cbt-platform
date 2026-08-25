# ADR-0018 — Grading scale entity, ownership and versioning

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** M-06 (HIGH)
**Blocks phases:** B15

## Context

`05 §46` requires school-configurable grading and is explicit that the Nigerian default must not be hard-coded: _"School Admin should define grading policies where necessary. The raw marks + percentage must always remain available."_ `07 §10.1` gives `Result` a `grade` field; `04 §19` lists grading under School Settings.

Missing entirely: the entity, its bands, its owner, and — most importantly — **what happens to historical results when the scale changes**. If grades are computed on read, editing a scale silently rewrites history, violating `07 §42` invariant 13. If stored without provenance, a school editing mid-session produces two cohorts graded differently with nothing recording why.

## Decision

**A versioned `GradingScale` owned by the school, with the grade frozen at finalisation.**

- `GradingScale` belongs to the school, with **optional level scoping** — a JSS scale may differ from an SS scale, and optional scoping supports both without forcing either.
- Bands are ordered percentage ranges with a label.
- **Editing a scale creates a new version**; bands are never mutated in place.
- `Result.grade` **and** `grading_scale_version_id` are both stored at finalisation.
- Raw `earned_marks` and `percentage` remain authoritative (`05 §46`), so any later regrade is a reporting choice, not a data rewrite.
- A platform default scale is offered at onboarding as a **starting point**, freely editable — never enforced.

## Consequences

**Easier**

- Historical grades are stable and explainable: every result names the scale version that produced it.
- Schools with different JSS and SS conventions are supported.
- Changing a scale mid-session is safe.

**Harder**

- Version proliferation if a school edits repeatedly; the settings UI should make versioning visible so it is not a surprise.
- Reporting across a scale change must decide whether to show stored grades or recompute — resolved as: **always show the stored grade**; recomputation is an explicit, separate action if ever needed.

**Required changes**

- B15: `GradingScale` with versions and optional level scoping; grade and version stored at finalisation.
- B3/B5: default scale offered at onboarding.
- F5: grading configuration with visible versioning.
- F14/F15: display the stored grade; never recompute on read.
