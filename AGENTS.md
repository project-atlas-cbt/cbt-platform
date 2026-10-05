# AGENTS.md

## Purpose

This repository contains a production-grade commercial CBT platform.

AI coding agents must treat the project specifications, architecture, and roadmap as authoritative project constraints.

---

## 1. Read Before You Build

Before making a meaningful implementation change:

1. Read `PROJECT.md`.
2. Read `CLAUDE.md`.
3. Read the relevant specification in `/docs`.
4. Read the relevant roadmap phase.
5. Inspect the existing implementation before changing it.

Do not begin implementation based solely on a task description if the relevant specification already defines the behaviour.

---

## 2. Source-of-Truth Hierarchy

Use this precedence:

1. Explicit current user/developer instruction
2. Approved product/architecture specification
3. Approved architecture decision records
4. Current roadmap
5. Existing implementation
6. Agent assumptions

Never allow an old implementation to override a newer approved specification.

---

## 3. Do Not Invent Requirements

Do not:

- Invent product features.
- Add unrelated functionality.
- Turn the platform into an LMS.
- Introduce new permanent roles without approval.
- Change product behaviour silently.
- Modify business rules merely to simplify implementation.

When a requirement is ambiguous, inspect the specifications first.

If ambiguity remains material, document it as an open decision rather than silently making a major product decision.

---

## 4. Architecture Discipline

Respect the approved architecture.

In particular:

- Preserve domain boundaries.
- Do not bypass authorization.
- Do not place business logic arbitrarily in controllers.
- Do not use Redis as the authoritative store for academic records.
- Do not introduce microservices without an explicit architectural decision.
- Do not introduce Kubernetes without an explicit architectural decision.
- Do not bypass the database transaction boundaries of critical examination workflows.

---

## 5. Examination Integrity

The CBT engine is a high-integrity subsystem.

Never compromise:

- Attempt timing
- Attempt ownership
- Question snapshots
- Answer persistence
- Submission state
- Result provenance
- Historical records
- Auditability

A browser/client must never be treated as the ultimate authority for:

- Exam duration
- Score
- Attempt validity
- Eligibility
- User permissions

---

## 6. Tenant Isolation

Every school-owned operation must respect school boundaries.

Never allow:

- Cross-school reads
- Cross-school writes
- Cross-school object references
- Cross-school file access
- Cross-school result visibility

Authorization must be evaluated from current application state, not assumed from client-provided identifiers.

---

## 7. Data Integrity

Prefer:

- Database constraints
- Foreign keys
- Transactions
- Explicit state transitions
- Immutable historical records
- Audit events

over assumptions implemented only in frontend code.

---

## 8. Security

Never commit:

- Secrets
- API keys
- Production credentials
- Private certificates
- Database passwords
- Environment files containing real credentials

Use environment variables or approved secret-management systems.

Validate all external input.

Do not trust client-side role, school, class, or exam identifiers.

---

## 9. Dependencies

Do not add a dependency merely because it is convenient.

Before introducing a significant dependency:

- Check whether the existing stack already provides the capability.
- Verify compatibility with the architecture.
- Consider security and maintenance implications.
- Record important dependency decisions where appropriate.

---

## 10. Testing

A task is not complete without appropriate validation.

Use the strongest practical level of testing for the change:

- Unit tests
- Integration tests
- End-to-end tests
- Browser tests
- Concurrency/load tests
- Failure/recovery tests

Critical examination flows require stronger testing than ordinary administrative CRUD.

---

## 11. Documentation

When implementation changes product behaviour, architecture, business rules, or operational procedures:

1. Update the appropriate specification or ADR.
2. Update the roadmap if scope/state changed.
3. Add a dated entry to `CHANGE-LOG.md`, and refresh `CLAUDE.md`'s status summary if the current phase changed.

Do not allow implementation to silently diverge from documentation.

---

## 12. CLAUDE.md Maintenance

`CLAUDE.md` loads at the start of every session, so it holds durable context — product rules,
architecture decisions, the current phase, open items and blockers — not a history of how each
phase was built. Record completed work, implementation detail and test results as a dated entry in
`CHANGE-LOG.md`, and keep `CLAUDE.md`'s status summary to a few lines that point there.

---

## 13. Roadmap Maintenance

When a roadmap item is completed:

- Mark it complete.
- Record relevant implementation notes.
- Record tests completed.
- Identify dependent frontend/backend work.
- Do not mark a feature complete merely because part of it works.

A roadmap phase is complete only when its Definition of Done is satisfied.

---

## 14. No Silent Scope Expansion

If implementation reveals a useful feature that is outside the approved scope:

Do not implement it automatically.

Record it as:

**Candidate / Deferred**

and continue with the approved scope unless explicitly instructed otherwise.

---

## 15. Refactoring Discipline

Do not perform unrelated broad refactors while implementing a feature.

If a refactor is required for architectural correctness:

- Explain why it is required.
- Keep it scoped.
- Test it.
- Document the relevant decision.

---

## 16. Git Discipline

Use focused commits.

Commit messages should describe meaningful changes.

Avoid:

- Giant unrelated commits
- Generated artifacts
- Secrets
- Temporary debugging files
- Machine-specific configuration

The main branch must remain deployable.

---

## 17. Completion Reporting

When finishing a task, report:

- What changed
- What was tested
- What remains
- Any assumptions
- Any deferred item
- Any documentation updated

Do not report a feature as complete if known gaps remain.

---

## 18. Frontend / UI Work

ExamKeep has a project-specific design doctrine. It lives in two places:

- [`docs/design/ui-ux-principles.md`](docs/design/ui-ux-principles.md) — the human-readable
  design specification and rationale.
- [`.claude/skills/project-atlas-ui/SKILL.md`](.claude/skills/project-atlas-ui/SKILL.md) — the
  operational doctrine, meant to be consulted alongside the project-scoped `frontend-design`
  (aesthetic direction) and `web-design-guidelines` (accessibility/UX compliance review) skills.

Do not duplicate that doctrine here — read it, don't restate it.

### Before building a new screen

1. Read the relevant product specification.
2. Read the relevant roadmap phase (`docs/roadmaps/frontend-roadmap.md`).
3. Consult the `project-atlas-ui` skill for this screen's role and context (it defines different
   priorities for CBT runtime, Exam Control Center, HOD review, and each administrative role).
4. Use the approved component/design system (shadcn/ui restyled to ExamKeep's tokens) rather
   than inventing new primitives.
5. Make deliberate visual decisions rather than defaulting to generic AI-dashboard templates —
   see the doctrine's anti-pattern list before assuming a layout.

### Before declaring frontend work complete

- Verify responsive behaviour at the target lab-hardware profile.
- Verify loading, error, and empty states are implemented, not deferred.
- Verify accessibility (keyboard operability, visible focus, contrast, labeled inputs) — run the
  `web-design-guidelines` skill's compliance check.
- Visually inspect the implemented screen.
- Verify consistency with existing ExamKeep UI — no second visual language introduced for a
  workspace that already has an established one.

---

## 19. Frontend/Backend Phase Pairing

Default posture, per explicit project-owner instruction (2026-08-25): **do not let the frontend
trail the backend by a large, unimplemented margin.** Once a frontend phase's corresponding/
depending backend phase(s) are built (per `docs/roadmaps/roadmap-index.md`'s phase pairing), build
that frontend phase too — before moving further down the backend critical path — unless there is
a strong, stated reason to defer it for that specific phase.

Rationale: it proves the contract works end to end rather than only in isolation, and it lets the
project owner start manual testing against a real UI as soon as the backend supporting it exists,
rather than waiting for the entire backend critical path to finish first.

This is a default, not an absolute rule:

- If a frontend phase's roadmap entry itself recommends deferring (e.g. it depends on a _later_
  backend phase too, or its own scope is better built alongside a different phase), say so
  explicitly and proceed with the backend phase instead — do not silently skip the frontend phase
  without recording why.
- `F0` (design system) and `F13` (offline exam engine) have no backend dependency and may proceed
  independently at any time, per the roadmap's own note.

---

## 20. Default Behaviour

When uncertain:

**Prefer preserving data, preserving auditability, preserving architecture, and preserving explicit product intent over taking a shortcut.**
