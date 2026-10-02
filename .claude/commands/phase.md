---
description: Start implementing a roadmap phase (plan first, then build)
argument-hint: <phase id, e.g. B20>
---

Implement roadmap phase $ARGUMENTS only. Its paired phase gets its own session after this one ships.
Context: @PROJECT.md

Before writing code, read this phase's roadmap section, its gating ADRs, the audit findings
assigned to it, the specs it references, and the existing code it builds on. Then give me a
short plan:

- the scope as you understand it
- any conflict between the specs, ADRs, roadmap and current code
- any decision that's genuinely mine to make

Wait for my answers on those decisions only; proceed on everything else.

Done means the phase's Definition of Done is met with the testing it requires, the roadmap,
CHANGE-LOG.md and the CLAUDE.md status are updated, and you report back per AGENTS.md §17. In that
report, name the phase this one unblocks next (per the phase-pairing rule) and anything its session
should know that the published contract and CHANGE-LOG.md entry don't already say.
