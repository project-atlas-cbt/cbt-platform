---
name: project-atlas-ui
description: Project Atlas's own UI/UX doctrine — product character, per-role design priorities, branding/token architecture, and anti-patterns for this CBT platform. Use for any frontend/UI work in this repository (apps/web), alongside the frontend-design and web-design-guidelines skills. Specializes those generic skills for a serious school examination product; does not replace them.
metadata:
  type: project
---

# Project Atlas UI/UX Doctrine

This skill specializes the generic **frontend-design** skill (aesthetic direction, typography,
motion) and **web-design-guidelines** skill (accessibility/UX compliance review) for Project
Atlas specifically. Use all three together:

1. **frontend-design** — how to make deliberate, non-templated visual choices.
2. **web-design-guidelines** — fetch-and-check compliance against the Web Interface Guidelines.
3. **project-atlas-ui** (this skill) — _what those choices should be, for this product_: which
   aesthetic risks are appropriate, which are not, how roles differ, and how school branding
   composes with the rest of the system.

Read `docs/design/ui-ux-principles.md` for the human-readable version of this doctrine and its
rationale. This file is the operational instruction set; that file is the reference document.

---

## 1. Product character

Project Atlas is a **commercial, multi-tenant school examination platform** — not an LMS, not a
generic SaaS dashboard, not a startup marketing site. Every screen should read as:

- **Professional** — a school's paying administrators and inspectors will judge the institution
  partly by this software.
- **Trustworthy** — it holds student results and exam integrity. Nothing about the UI should feel
  provisional, playful, or ambiguous about what an action does.
- **Calm** — no screen should feel like a stock-trading terminal. Even the Exam Control Center,
  which is genuinely high-stakes, should feel _controlled_, not frantic.
- **Modern** — current, well-crafted software, not a 2014 admin template. This is compatible with
  restraint; it is not compatible with looking dated.
- **Institutional** — appropriate for teachers, HODs, and school administrators, most of whom are
  not power users of consumer software. Clarity beats cleverness.
- **Efficient** — every screen exists because a role has a job to do on it. Decoration that slows
  a teacher down in a computer lab is a defect, not a style choice.
- **Polished** — consistent spacing, alignment, and typography throughout. Polish here means
  _discipline_, not ornamentation.

Apply `frontend-design`'s instruction to "take one real aesthetic risk you can justify" — but the
justified risk in Project Atlas is almost never decorative. It shows up as: a genuinely well-
designed Exam Control Center that makes 40 students' live status legible at a glance; a Question
Review queue fast enough to process 27 questions without friction; an exam runtime so quiet it
disappears and lets the student focus. **Spend the boldness on operational clarity, not visual
flourish.**

---

## 2. Explicitly avoid generic AI aesthetics

Project Atlas must not look like a generated admin template. Do not default to:

- Generic AI dashboard layouts (metric-card grid + sidebar + line chart, repeated on every screen).
- Rounded cards on every surface, everywhere, as the default container.
- Arbitrary gradients, especially purple-on-white or purple-to-blue hero gradients.
- Glassmorphism (frosted blur panels) as a default design language.
- Excessive drop shadows / floating-card effects stacked on every element.
- Decorative animations with no state-change or feedback purpose.
- Oversized dashboard typography (huge display numbers) where the number isn't the point.
- Whitespace so generous that operational screens (Exam Control Center, review queues, tables)
  lose information density they actually need.
- Meaningless metric-card grids — a number in a card is only justified if a role would act
  differently depending on its value (§67 of `04-module-screen-map.md`: every dashboard answers
  one specific question for its role).
- Emoji used as functional UI icons (status indicators, buttons, navigation). Emoji in
  illustrative/empty-state copy, used sparingly and deliberately, is a separate, acceptable case —
  never as a stand-in for an icon that carries meaning.
- Inconsistent button, form, or table styling between workspaces — one visual language for the
  whole product, expressed differently only where role UX genuinely differs (§3 below).
- Gratuitous visual effects (parallax, hover-tilt, animated gradients) with no functional purpose.
- Making every screen the same dashboard template regardless of what the role actually needs.

**This is not a mandate for blandness.** `frontend-design`'s instruction to make deliberate,
non-templated choices about type, layout, and one signature element still applies. The
constraint is _what kind_ of distinctiveness is appropriate: institutional confidence, not
consumer-app personality.

---

## 3. Role-specific UX philosophy

Per `docs/04-module-screen-map.md` §67, every dashboard must answer its role's one real question.
Do not build one dashboard shape and reskin it six times.

| Role                | Governing question                                                                    | Design priority                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School Admin        | "Is my school operational and performing?"                                            | Information-dense operational overview: school health, academic operations, alerts, results, configuration. Alerts (`"2 classes have no Mathematics teacher assigned"`) outrank decorative metrics. |
| Moderator           | "Is the school's data and user structure correct?"                                    | Data/operational management: students, teachers, assignments, imports, exam operations, bulk workflows. Optimize for high-volume CRUD and batch actions, not narrative dashboards.                  |
| HOD                 | "Is my department academically ready and performing well?"                            | Academic governance. The question-review queue is the dominant surface — see §5 below. Department readiness and performance analytics second.                                                       |
| Teacher             | "Can I create, administer, and evaluate my assessments?"                              | Assessment creation and administration: question bank, exam builder, exam control, results, classes. This is the most feature-rich workspace; resist letting it sprawl into unrelated admin.        |
| Student             | "Do I have an assessment to take, and what are my results?"                           | Radical focus. No LMS-style clutter, no feed, no unrelated navigation. Navigation is exactly `Assessment / Results / Profile` (`04 §52`).                                                           |
| CBT Runtime         | (no dashboard question — it is a task, not a workspace)                               | See §4.                                                                                                                                                                                             |
| Exam Control Center | "What is the live state of this exam, and does anything need my attention right now?" | See §6. Operational status over decorative analytics, always.                                                                                                                                       |

General rule: **do not give every role the same navigation shape with different labels.** A
Moderator's "People" screens and an HOD's "Question Review" screen should not visually resemble
each other just because they're both list-with-detail — they serve different cognitive tasks
(bulk operational management vs. sequential academic judgment) and should be built for those
tasks specifically.

---

## 4. CBT runtime — a special UX mode

The exam interface (`04 §55`–`§59`, roadmap `F13`) is not a page inside the app shell. It is a
separate, minimal runtime. Rules:

- **No sidebar, no app navigation, no profile menu, no notification bell.** Only what `04 §55`
  shows: subject/title, timer, question navigator, question + options, Previous/Next, Submit.
- **No unnecessary animation.** Transitions between questions should be near-instant, not an
  opportunity for a page-transition flourish. A CBT runtime with slow or showy transitions is a
  defect under exam time pressure.
- **No social/marketing UI of any kind** — no "upgrade," no promotional banner, no unrelated links.
- **Connection status is always visible, and is the most important non-answer element on screen**
  (`04 §57`). It communicates local-vs-server truth (§12 below), never implies the client is the
  authority on time, eligibility, or submission.
- **The question navigator states are exactly**: unanswered, answered, current (`04 §56`) — do not
  invent a fourth visual state without a corresponding product state to back it.
- Time warnings (5 minutes, 60 seconds) are unmistakable but not alarming to the point of inducing
  panic — clear, high-contrast, non-dismissible-by-accident, not a jump-scare animation.
- Every visual decision here should be justifiable by: _does this help a student under time
  pressure answer correctly and submit successfully?_ If not, cut it.

---

## 5. HOD question review — an efficient queue, not CRUD

`04 §70` names this the second most important screen in the product. Design it as a **processing
queue**, not a list-then-detail CRUD pattern:

- Approve → Reject → Comment → Next should be reachable without a full page navigation between
  questions (`04 §30`, roadmap `F10`).
- Keyboard shortcuts for approve/reject/next are a real requirement, not a nice-to-have — an HOD
  processing 27 questions should rarely need the mouse.
- Show exactly what an academic reviewer needs to judge a question — question, options, correct
  answer, metadata, author, revision history — and nothing that isn't part of that judgment.
- Rejection reasons are first-class, visible content, not an afterthought text field.
- This queue should feel like professional editorial/moderation tooling (fast, keyboard-driven,
  low-latency prefetch of the next item), not a generic admin "edit record" form.

---

## 6. Exam Control Center — an operational console, not an analytics dashboard

`04 §69` names this the single most important screen in the product. It is used live, by a
teacher standing in a lab with 40 students and 20 computers. Design priorities, in order:

1. **Can the teacher answer, at a glance**: who has access, who started, who's still writing, who
   submitted, who's disconnected, who needs attention, who's in the next batch?
2. **Status legibility beats decoration.** A dense, well-organized live table with clear status
   colors and server-derived time-remaining outperforms any chart here.
3. **Never show stale data as if it were live.** When the SSE stream drops, the UI must show a
   visible stale indicator and disable controls that require live authority — never quietly keep
   displaying the last-known counts as current (`08 §12.2`).
4. **Controls are confirmed-state only.** No optimistic UI for "close new attempts," "authorize
   batch," or "end exam" — the teacher must see the server's confirmation, not a hopeful client
   guess, because these are irreversible-in-the-moment operational decisions.
5. Restrained, purposeful motion only: a status changing color when a student submits communicates
   something real; a decorative transition on every re-render does not and will cause the screen
   to feel noisy exactly when it needs to feel calm.

---

## 7. Design-system principles

These are defaults for Project Atlas; deviate only with a stated reason.

**Typography.** One type family for UI (a workhorse grotesk/humanist sans with excellent
legibility at small sizes and strong number/tabular-figure support — exam timers, scores, and
tables all need this). A second face only if a genuine editorial moment calls for it (rare —
this is an operational tool, not a marketing site). Tabular numerals for scores, timers, and any
column of numbers that must align.

**Spacing.** A consistent 4px-based scale throughout. Density varies deliberately by context:
operational/data-dense screens (Exam Control Center, tables, review queues) use tighter spacing;
the CBT runtime and empty/onboarding states can afford more air. Never let generous whitespace
win over information density on a screen a role uses under time pressure.

**Radius.** Small, consistent radius (a single scale of 2–3 steps) used the same way everywhere.
Not zero (that reads as the "broadsheet" AI-default look this doctrine also avoids), not large
"friendly SaaS" pill-rounding everywhere. Radius should read as tidy, not soft.

**Shadows.** Minimal. Reserve elevation shadows for things that are actually elevated —
dropdowns, dialogs, popovers. Do not shadow every card just to separate it from the background;
use a border or a subtle surface-color shift instead (see tokens, §9).

**Borders.** The primary tool for separating surfaces on data-dense screens — cheaper visually
than shadows, and more legible at high information density.

**Iconography.** One consistent icon set, line-style, used only where an icon adds real
recognition speed (navigation, status, actions) — never as decoration, never as a stand-in for a
label a user actually needs to read once and never re-derive. Never emoji (§2).

**Buttons.** A small number of variants with fixed meaning, applied consistently: primary
(the one recommended action per view), secondary, destructive, ghost/tertiary. Destructive
actions (suspend school, invalidate attempt, reject question, end exam) are visually distinct and
require explicit confirmation — never a single accidental click.

**Inputs.** Consistent label placement, consistent error-state styling, consistent help-text
placement, across every form in the product — School Setup Wizard, Question Editor, Exam Rules,
Settings. A user should never have to relearn how a form works between workspaces.

**Tables.** The workhorse of the admin surfaces (student directories, question banks, results).
Server-side pagination/filter/sort for anything that can reach real-school scale (1,000+
students — `F7`'s Definition of Done requires this explicitly). Sticky headers on long tables.
Consistent column alignment: text left, numbers right, status as a badge.

**Badges.** One consistent badge component for all status display (question status, exam status,
attempt status, participation status). Color mapped to semantic meaning, not per-screen
invention — "Approved" is the same visual language in the Question Bank and in Question Review.

**Dialogs.** Reserved for decisions that need focus: destructive confirmations, the readiness
checklist, makeup-access grants. Not used as a general-purpose "avoid building a page" escape
hatch.

**Notifications.** Action-oriented only, per `04 §64` — never a social/activity feed. Every
notification should name the next action a role can take, not just report an event.

**Navigation.** Role-specific per `04 §68`'s module map — see §3. The academic context switcher
(school / session / term, `04 §66`) is persistent chrome wherever it's relevant; getting this
wrong risks a real operational mistake (acting in the wrong academic session), so it is never
optional decoration.

**Loading states.** Skeletons that match the real layout's shape, not a generic spinner, for
anything that takes a moment on a real network. Never block the whole screen for a partial data
failure — degrade the specific section (`05 §2.1`: dashboard metric failure must not blank the
whole dashboard).

**Error states.** Specific, actionable, and honest about retryability — surface the error
envelope's `retryable` flag (ADR-0033) to decide whether to offer a retry action or a different
next step. Never a bare "Something went wrong."

**Empty states.** Every empty state explains _why_ it's empty and, where applicable, what to do
next ("No schools have been onboarded yet" / "No assessment is currently available — please wait
for your teacher"). An empty state is content, not a placeholder to fill in later.

**Responsive behaviour.** The primary target is lab hardware — desktop/laptop browsers at modest
resolutions, not phone-first. Administrative and CBT screens must remain usable down to the
project's documented lab resolution baseline (`F0` DoD item 8); do not design mobile-first and
retrofit.

**Accessibility.** See §11.

**Motion.** See §13.

---

## 8. School branding: one colour and a logo, never more

A school supplies exactly **one primary colour** and **one logo**. The platform derives
everything else. Never ask a school to configure a full palette, and never hard-code a school's
colour into a component.

```text
Primary brand colour
        ↓
Derived design tokens        (hover, active, subtle/tint, on-brand foreground)
        ↓
Surface/background variants  (background, surface, surface-muted, border — brand-tinted or neutral
                               depending on where the token is used)
        ↓
Interactive states           (hover, focus-visible ring, pressed, disabled)
        ↓
Accessible foregrounds       (text/icon color guaranteed to meet contrast on every derived surface)
```

Rules:

- **Accessibility takes precedence over exact reproduction of an unsuitable primary colour.** If a
  school's chosen colour cannot produce an accessible foreground/background pairing at the
  required contrast ratio, the derivation adjusts (lightness/chroma, not hue) rather than shipping
  an inaccessible interface. This is a documented, deliberate trade-off — never a silent one; the
  branding UI (`F5`) should be able to explain when and why a shade was adjusted.
  - _Every school colour must yield a derived set that passes WCAG AA contrast for text and
    interactive-state foregrounds._ This is a hard requirement, not a target.
- The derivation is a **function**, not a design decision made per-school by a human — same input
  colour always produces the same token set.
- Branding changes propagate to every context a school interface appears in — login, dashboard,
  buttons, tables, and the exam interface (`03 §5`, `F5` DoD item 4) — but **never retroactively
  alter historical reports** (`05 §6.1`): a report generated before a rebrand keeps its original
  presentation where that matters for record fidelity.
- Components read only semantic tokens (`--brand-primary`, `--surface`, etc.), never a raw school
  hex value. This is what makes the CBT runtime, the admin shell, and reports all reflect the same
  brand without every component needing brand-specific logic.

---

## 9. Design-token architecture

Semantic tokens only — no component ever reads a raw colour value or a school's hex code
directly. Conceptual token set (implementation may refine names, but should follow this shape):

```text
--brand-primary
--brand-primary-hover
--brand-primary-active
--brand-primary-subtle           /* tinted background for selected/highlighted state */
--brand-primary-foreground       /* guaranteed-accessible text/icon color on brand-primary */

--background                     /* page background */
--surface                        /* card/panel/table background */
--surface-muted                  /* secondary surface, e.g. table header, disabled fill */
--border
--border-strong                  /* emphasis border, e.g. focused input */

--text-primary
--text-secondary
--text-muted
--text-on-brand                  /* same guarantee as brand-primary-foreground */

--success / --success-subtle / --success-foreground
--warning / --warning-subtle / --warning-foreground
--danger  / --danger-subtle  / --danger-foreground
--info    / --info-subtle    / --info-foreground

--focus-ring                     /* always visible, never suppressed — see §11 */
```

Status tokens (`success`/`warning`/`danger`/`info`) are **fixed, semantic, and not derived from
school branding** — a "Rejected" badge must be legible and recognizable as danger-red regardless
of a school's brand colour. Only the `brand-*` and neutral `surface`/`background`/`text` tokens
derive from the school's primary colour and are allowed to shift per tenant.

Do not invent a component-local colour when a semantic token already exists for that purpose.

---

## 10. Component strategy

The approved technical stack (`docs/09-technology-selection-and-technical-stack-evaluation.md`)
is Next.js/React. **shadcn/ui is the implementation foundation** where a component system is
needed: it ships as owned source (not a black-box npm dependency), which is exactly what a
token-driven, per-tenant-branded design system needs — full control over how each primitive
consumes the semantic tokens in §9.

> **Component library = implementation foundation.**
> **Project Atlas design doctrine (this document) = visual identity and UX judgment.**

Concretely: use shadcn/ui primitives (button, dialog, table, form, etc.) as the accessible,
behaviorally-correct base, then restyle them to consume this doctrine's tokens and satisfy the
role-specific UX rules in §3–§6. Do not ship shadcn's default styling untouched — that is exactly
the "generic AI dashboard" look this doctrine exists to avoid. Do not invent parallel bespoke
primitives for things shadcn/ui already provides correctly (focus management, keyboard
navigation, portal/positioning behaviour) — that duplicated effort tends to regress
accessibility.

---

## 11. Accessibility rules

Non-negotiable, enforced on every screen:

- Full keyboard navigation — every interactive element reachable and operable without a mouse.
- **Visible focus states, always.** Never `outline: none` without a replacement focus treatment
  using `--focus-ring`. `web-design-guidelines`' fetched ruleset checks this explicitly — run it.
- Semantic HTML first; ARIA only to fill a genuine gap semantic HTML can't cover.
- Contrast: WCAG AA minimum for all text and meaningful icons, on every derived brand surface
  (§8) — this is where branding and accessibility rules intersect and neither wins by default.
- Every form input has a real, associated label — never a placeholder standing in for a label.
- Errors are associated with their field programmatically (not just visually adjacent) and
  announced to assistive tech.
- Tables use real table semantics (headers associated with cells) — critical for the large
  student/result tables this product is full of.
- Respect `prefers-reduced-motion` everywhere motion is used (§13).
- Status communicated to screen readers, not just by color — a badge's meaning must not depend on
  color perception alone (icon or text label alongside color).
- Charts/analytics (HOD department analytics, teacher question analytics) need a non-visual
  equivalent (accessible data table or summary) alongside any chart.

**The exam runtime gets the strictest scrutiny of all**, per `AGENTS.md` §5 and `04 §71`: a
student may be under real time pressure, possibly on assistive technology, on aging lab hardware.
Every accessibility rule above is a release-blocker for `F13`, not a nice-to-have.

---

## 12. Network-resilient UX rules

Built for Nigerian school network conditions (`01 §10`, `09`). Every data-bearing screen must:

- Show an explicit loading state — never a blank screen while data is in flight.
- Make errors retryable where the error envelope's `retryable` flag says so, and say so plainly
  where it doesn't (§7 "Error states").
- Show a clear, persistent offline/connection indicator wherever connectivity matters — the app
  shell (`F2`) and, most critically, the exam runtime (`F13`, §4 above).
- Prefer non-blocking feedback (toasts, inline status) over blocking modals, **except** for
  destructive or irreversible actions, which must always block for explicit confirmation.
- **Never use optimistic UI for sensitive operations** — exam control actions, result publication,
  attempt invalidation, subscription/lifecycle actions. Show confirmed server state only. This is
  a direct consequence of `AGENTS.md` §5 and §6: the client is never the authority.
- Distinguish, visually and in copy, between "saved locally" and "confirmed by server" — this
  distinction is the entire point of `F13`'s offline engine (`09 §8`) and must be legible to the
  student, not just correct underneath.
- Reconnection is graceful: state resyncs and reconciles against server-authoritative truth,
  never against the client's own optimistic guess (`08 §12.3`).

> The client may be locally responsive, but the server remains authoritative for timing,
> eligibility, submission, and examination validity. No visual design choice should imply
> otherwise — e.g., don't show a checkmark on "submitted" before the server has actually
> acknowledged it.

---

## 13. Motion rules

Motion must communicate something: state change, hierarchy, transition, or feedback. If a motion
doesn't do one of those four things, cut it.

- **CBT runtime**: especially restrained. Near-instant question transitions; no decorative
  page-load animation; timer warnings are visually unmistakable without being a startling
  animation.
- **Administrative screens**: subtle transitions are fine — a panel sliding in, a row highlighting
  on update — as long as they're fast and never block interaction.
- **Exam Control Center**: motion should communicate real state changes (a student's row updating
  when they submit) and nothing else. No ambient/idle animation on a screen meant to feel calm
  under pressure.
- Always respect `prefers-reduced-motion` (§11).
- Never animate merely to make a screen "feel impressive" — that is precisely the AI-generated-
  dashboard smell this doctrine exists to avoid (§2).

---

## 14. Before you build a screen

1. Read the relevant product spec section and roadmap phase (`AGENTS.md` §1).
2. Identify which role(s) use this screen and which governing question (§3) it must answer.
3. Check whether it's a CBT-runtime, Exam-Control-Center, or Question-Review context — each has
   dedicated rules above (§4–§6) that override the general defaults.
4. Use shadcn/ui primitives restyled to this doctrine's tokens (§9–§10) — don't invent new visual
   language.
5. Design loading, error, and empty states as part of the screen, not an afterthought (§7).
6. Run the `web-design-guidelines` skill's compliance check before considering the screen done.
7. Confirm the screen doesn't duplicate another workspace's visual pattern for a genuinely
   different task (§3's closing rule).
