# ADR-0035 — In-app help centre (role-tailored guides)

**Status:** Accepted
**Date:** 2026-10-05
**Deciders:** Haneef (project owner)
**Audit findings:** none
**Affects phases:** F21 (user documentation, DoD 7)

> Numbering: ADR-0034 is the public marketing site (PR #39). This decision takes 0035 whichever
> merges first.

## Context

Once a school is onboarded and trained, staff forget tasks they do once a term: rollover, makeup
access, publishing results, imports. Today they phone us, and the fallback is re-running training
at the school. Nothing in the app answered "how do I…?".

The audit of 2026-10-05 found no help screen. F21 (draft PR #40) writes teacher, invigilator and
student guides in `docs/user-guides/` as documents to hand over; there are none for school admins,
moderators or HODs. `04 §5` mentions a Software Admin "Support" area only as "potentially, later",
and `04 §68` fixes each role's navigation.

Two directions were weighed: an in-app help centre, or an AI assistant for staff. The owner chose
**docs first**: an assistant needs the same guides as its knowledge base, costs money per question
on a tight pilot budget, can give confident wrong advice during a live exam, and would send staff
questions to an outside provider.

## Decision

1. **A Help screen in every staff workspace** (School Admin, Moderator, HOD, Teacher), reached from
   a "Help" item at the end of the navigation. This amends `04 §68`. Students and Software Admin
   get no Help screen.
2. **Guides are task-shaped and role-tailored.** Each answers one task in numbered steps that name
   the real screen and button, with "Good to know" notes for consequences and limits. Each guide
   lists the `PERMISSION_TABLE` ids it needs; a user sees it only when they hold one of them
   (break-glass grants excluded, as in the navigation).
3. **Guides live in the web app's source** (`apps/web/lib/help/guides/`) as typed content, one
   module per role. Each role's Help routes import only that role's module, so one role's guides
   never ship in another role's bundle. No API route, table, migration or dependency is added.
   Guide text supports `**Button**` and `{product}` only, rendered to React nodes without HTML.
4. **Search runs in the browser** over the guides the user can see.
5. **Contextual links**: the exam builder, question editor, imports, question review, the Control
   Center, makeup access, results and rollover screens carry a small "Help" link to their guide.
6. **"Still stuck?" contact**: the Help screen shows the support email and WhatsApp number from
   configuration (`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_WHATSAPP`; on the VPS,
   `SUPPORT_EMAIL` and `SUPPORT_WHATSAPP` in `infra/vps/.env`). An unset channel is hidden.
7. **The product name** in guide text comes from `PRODUCT_NAME`, never written literally.
8. **Screen only**: no print layout or download of the in-app guides.
9. **No usage tracking**: no record of searches or guide views, and no Software Admin support view.
10. **Two maintained copies**: the in-app guides and F21's `docs/user-guides/` are both kept. A
    change to a screen a guide describes updates both in the same change.
11. **If permissions cannot be loaded**, the Help screen shows the role's whole guide set rather
    than nothing: help matters most when something is failing, and guide text is not sensitive.
12. **No AI assistant** in this decision. Students never get an AI agent. A staff assistant may be
    proposed after the pilot as a separate ADR, grounded only on these guides, read-only, with cost
    caps.

## Consequences

**Easier**

- Staff answer their own "how do I" questions at the moment they need it, inside the screen they
  are using.
- No running cost and nothing new on the VPS.
- Guides are reviewed with the code. Tests fail when a guide links to a route that does not exist,
  requires a permission its role does not hold, or writes a product name literally.
- A later assistant has a role-tagged knowledge base ready.

**Harder**

- Guides drift if screens change without updating them, and there are two copies to keep in step
  (decision 10). The route and permission tests catch broken links, not changed wording.
- Changing guide text or the support contact needs a deploy.

## Alternatives considered

- **AI assistant now**: rejected for now (cost, accuracy risk in live exams, data transfer, needs
  the guides anyway).
- **Markdown with a renderer**: adds a dependency and an HTML injection surface under the nonce CSP
  for no gain over typed content.
- **Guides in the database, editable by Software Admin**: new tables, routes and an editor; not
  needed while guides change rarely.
- **Hand-over documents only**: people forget months later, and a document from training day is
  not where they look.
