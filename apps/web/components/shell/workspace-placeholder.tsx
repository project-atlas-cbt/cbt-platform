interface WorkspacePlaceholderProps {
  title: string;
  description: string;
}

/**
 * Content for a nav destination whose real screen hasn't been built yet.
 * F2's own scope is the shell and navigation, not the workspaces those
 * routes lead to — each is a later, separately-scoped roadmap phase (see
 * `docs/roadmaps/frontend-roadmap.md`). Rendering an honest "not built
 * yet" state here (rather than a bare 404, or nothing at all) satisfies
 * the shell's own loading/error/empty-state discipline while making zero
 * claim about functionality that doesn't exist — doctrine §7 ("Empty
 * states"): "content, not a placeholder to fill in later," applied to the
 * meta-honest case of the screen genuinely not existing yet.
 *
 * Matched by each role's `[...slug]/page.tsx` catch-all — a later phase
 * adding a real `page.tsx` at that path takes over automatically (Next.js
 * prefers the more specific route), so this component naturally recedes as
 * the product is built out rather than needing to be torn down by hand.
 */
export function WorkspacePlaceholder({ title, description }: WorkspacePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
      <p className="max-w-md text-sm text-text-muted">{description}</p>
    </div>
  );
}
