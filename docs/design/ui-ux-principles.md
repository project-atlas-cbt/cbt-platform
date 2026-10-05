# ExamKeep — UI/UX Principles

**Status:** Design governance, effective from `F0` onward · **Companion asset:**
[`.claude/skills/project-atlas-ui/SKILL.md`](../../.claude/skills/project-atlas-ui/SKILL.md)

This is a design _specification_ — the standing rationale behind ExamKeep's visual and UX
decisions. It is not implementation. It does not contain a component library, a token
implementation, or code. The operational, agent-facing instruction set that enforces this
document day-to-day is the linked skill above; read this document for the _why_.

Nothing here changes product scope or architecture. Where this document is silent, defer to the
product specifications in `docs/` and the architecture decision records in `docs/decisions/`.

---

## 1. Design philosophy

ExamKeep is a commercial, multi-tenant **school examination platform**, not a learning
management system and not a generic business dashboard. Its UI must communicate, on sight, that
it is a serious tool a school trusts with student results and exam integrity.

The governing test for any visual or interaction decision:

> **Does this choice help a specific role do a specific job faster, more clearly, or more safely
> — or does it just make the screen look more like software?**

If a design choice doesn't pass that test, it's decoration, and ExamKeep has a documented
bias against decoration that doesn't serve the work (§8).

Two skills operationalize this for AI-assisted implementation:

- **frontend-design** (Anthropic) — general doctrine for making deliberate, non-templated visual
  choices instead of defaulting to generic patterns.
- **web-design-guidelines** (Vercel) — a compliance checker that fetches and applies a live set of
  ~79 web-interface rules (accessibility, forms, performance, motion, etc.) against implemented
  screens.
- **project-atlas-ui** (this project) — specializes both for ExamKeep specifically. See
  `.claude/skills/project-atlas-ui/SKILL.md`.

---

## 2. Product character

The product should feel:

**Professional, trustworthy, calm, modern, institutional, efficient, polished.**

Concretely: a School Admin, HOD, or teacher should feel the same confidence in this software that
they'd feel in a well-run school's own paperwork systems — nothing ambiguous, nothing that looks
unfinished, nothing that overreaches into performative "innovation" at the expense of clarity.
Students, who may be minors under real exam-time pressure, get the calmest and most focused
experience in the entire product (§4).

"Calm" does not mean "boring." The product still makes deliberate, specific design choices — see
§8's note on where distinctiveness belongs.

---

## 3. Role-specific UX

Per `docs/04-module-screen-map.md` §67, every workspace answers one governing question for its
role. The UI is organized around that question, not around a shared dashboard template reskinned
six times.

| Role             | Governing question                                        | What the UI prioritizes                                                                                                                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **School Admin** | Is my school operational and performing?                  | Information-dense operational overview — school health, academic operations, alerts, results, configuration. Actionable alerts over decorative metrics. |
| **Moderator**    | Is the school's data and user structure correct?          | Operational data management — students, teachers, assignments, imports, exam operations, bulk workflows.                                                |
| **HOD**          | Is my department academically ready and performing well?  | Academic governance, dominated by the question review queue (§5). Department readiness and performance analytics second.                                |
| **Teacher**      | Can I create, administer, and evaluate my assessments?    | The richest workspace: question bank, exam builder, exam control, results, classes — with no unrelated administrative surface area.                     |
| **Student**      | Do I have an assessment to take, and what are my results? | Deliberately minimal. Navigation is exactly Assessment / Results / Profile. No LMS-style clutter.                                                       |

The product resists giving every role "the same dashboard with different labels." A Moderator's
bulk-management screens and an HOD's sequential review queue are built for genuinely different
cognitive tasks and should look and behave differently, not just carry different icons.

---

## 4. CBT runtime principles

The student exam interface is the product's most important experience precisely because it is
the simplest. `docs/04-module-screen-map.md` §71 puts it plainly: sophistication belongs behind
the scenes; the student sees login → assessment available → start → questions → submit → result.

Design rules:

- **No app shell.** No sidebar, no general navigation, no notification bell — only what the exam
  needs: subject, timer, question, options, navigator, Previous/Next, Submit.
- **Connection status is always visible** and never implies the client is authoritative over
  timing, eligibility, or submission — the server is (`AGENTS.md` §5, §9 below).
- **Minimal motion.** Transitions between questions are close to instant. No animation exists here
  for its own sake.
- **No social or marketing UI** of any kind.
- Time warnings are unmistakable, not alarming — clarity under pressure, not a jump-scare.

This mode receives the strictest accessibility scrutiny in the product (§7), because a student
under time pressure, possibly using assistive technology, on aging lab hardware, cannot afford an
inaccessible interface the way an administrator idly browsing a report can.

---

## 5. HOD question review principles

`docs/04-module-screen-map.md` §70 names question review the second most important screen in the
product. It should feel like a professional editorial/moderation queue, not a CRUD form:

- **Approve → Reject → Comment → Next**, without full-page navigation between questions.
- Keyboard-driven — an HOD processing 27 questions in a sitting should rarely need the mouse.
- Shows exactly what academic judgment requires (question, options, correct answer, metadata,
  author, revision history) and nothing extraneous.
- Rejection reasons are first-class content, not an afterthought.

---

## 6. Exam Control Center principles

`docs/04-module-screen-map.md` §69 singles this out as the single most important screen in the
product — a teacher's live invigilation console, used standing in a lab with dozens of students
and a fraction as many computers. In priority order:

1. At a glance: who has access, who's started, who's writing, who's submitted, who's
   disconnected, who needs attention, who's next.
2. Status legibility over decorative analytics — a well-organized live table beats a chart here.
3. **Stale data is never shown as live.** A dropped realtime stream shows a visible stale
   indicator and disables controls requiring live server authority.
4. Controls reflect confirmed server state only — no optimistic UI for irreversible-in-the-moment
   decisions like closing new attempts or ending the exam.
5. Motion only where it communicates a real state change (a student's row updating on submit).

---

## 7. Accessibility

Non-negotiable across the product, and a release-blocking concern for the exam runtime
specifically:

- Full keyboard operability; visible focus states everywhere (never suppressed without a
  replacement treatment).
- Semantic HTML first; ARIA fills genuine gaps only.
- WCAG AA contrast minimum — including on every colour a school's branding derives (§9).
- Every input has a real, programmatically associated label; every error is programmatically
  associated with its field and announced to assistive technology.
- Real table semantics for the product's many large data tables.
- Status communicated by more than color alone.
- `prefers-reduced-motion` respected everywhere motion is used.
- Charts and analytics ship with a non-visual equivalent.

---

## 8. Anti-patterns (what "avoid AI slop" means here)

This is a specific, not a vague, list — vagueness is how "avoid generic AI design" ends up
meaning "avoid creativity," which is not the intent.

Avoid:

- Generic metric-card-grid-plus-sidebar dashboards repeated unchanged across every role.
- Rounded cards as the default container for everything.
- Arbitrary or decorative gradients, especially the purple-on-white default.
- Glassmorphism as a default design language.
- Shadow-stacking every element for "depth."
- Animation with no state-change, hierarchy, transition, or feedback purpose.
- Oversized dashboard typography where the number displayed isn't actually the point.
- Whitespace so generous it costs an operational screen the density it needs.
- Metric cards that don't change any role's next action.
- Emoji standing in for functional icons.
- A different button/form/table visual language per workspace.
- Every screen shaped like the same template regardless of the job it does.

None of this forbids deliberate, specific design choices — it forbids the _default_ choices that
appear on any AI-generated interface regardless of what the interface is actually for. The
product's real distinctiveness should show up in operational clarity: an Exam Control Center that
actually makes a live exam legible, a review queue that's actually fast, an exam runtime that
actually disappears for the student.

---

## 9. Branding and theming

A school provides exactly **one primary colour and one logo**. The platform derives everything
else — no school ever configures a ten-colour palette, and no component ever hard-codes a
school's colour.

```text
Primary brand colour
        ↓
Derived design tokens        (hover / active / subtle-tint / on-brand foreground)
        ↓
Surface & background variants
        ↓
Interactive states            (hover, focus-visible, pressed, disabled)
        ↓
Accessible foregrounds        (guaranteed contrast on every derived surface)
```

**Accessibility outranks exact colour reproduction.** If a school's chosen colour cannot yield an
accessible pairing, the derivation adjusts lightness/chroma (never hue) rather than shipping
inaccessible UI — and the branding screen should explain when that adjustment happens, not hide
it. Status colours (success/warning/danger/info) are fixed and semantic, never derived from a
school's brand colour — a rejected question must read as "danger" the same way in every school.

Branding propagates everywhere a school's identity should appear — login, dashboard, buttons,
tables, exam interface — but never rewrites historical reports retroactively.

The full semantic token list lives in the skill (`SKILL.md` §9) since it's an implementation
detail; the principle to hold onto here is: **components read tokens, never raw school colours.**

---

## 10. Responsive behaviour

The primary target is lab/desktop hardware, not phone-first design — this is a computer-lab
product first (`01 §10`). Administrative and CBT screens stay usable at the project's documented
lab-resolution baseline; mobile refinement is a later, explicit concern, not an assumed default.

---

## 11. Motion

Motion communicates state change, hierarchy, transition, or feedback — or it doesn't belong. The
CBT runtime is the most restrained context in the product; administrative screens allow subtle,
fast transitions; the Exam Control Center allows only motion that reflects a genuine state
change. `prefers-reduced-motion` is respected everywhere.

---

## 12. Component philosophy

The approved stack is Next.js/React. **shadcn/ui is the implementation foundation** — owned
source rather than an opaque dependency, which is what a token-driven, per-tenant-branded system
needs. The rule:

> Component library = implementation foundation.
> ExamKeep design doctrine = visual identity and UX judgment.

Shadcn/ui's default styling is never shipped untouched — restyled to this document's tokens and
role-specific rules. Conversely, this project does not reinvent primitives (focus management,
positioning, keyboard behaviour) that shadcn/ui already provides correctly.

---

## 13. Network resilience as a UX requirement

Built for real Nigerian school network conditions (`01 §10`). Every data-bearing screen needs an
explicit loading state, an honest and — where the error envelope says so — retryable error state,
and a visible connection indicator wherever connectivity matters most (the exam runtime,
critically). Sensitive operations (exam control actions, publication, invalidation, subscription
lifecycle) never use optimistic UI; they show confirmed server state only. The distinction
between "saved locally" and "confirmed by the server" must be visible to the user, not just
correct underneath — this is the entire premise of the offline exam engine.

> The client may be locally responsive, but the server remains authoritative for timing,
> eligibility, submission, and examination validity. No visual design should imply otherwise.

---

## See also

- [`.claude/skills/project-atlas-ui/SKILL.md`](../../.claude/skills/project-atlas-ui/SKILL.md) —
  the operational doctrine agents consult while building screens.
- [`docs/04-module-screen-map.md`](../04-module-screen-map.md) — the module/screen structure this
  document assumes throughout.
- [`docs/roadmaps/frontend-roadmap.md`](../roadmaps/frontend-roadmap.md) — `F0` establishes the
  design system and theming engine this document governs.
