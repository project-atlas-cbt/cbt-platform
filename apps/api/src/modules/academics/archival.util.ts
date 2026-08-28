import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * Roadmap DoD item 5: "Destructive deletion is refused where history
 * exists, with a clear error." Deactivation (status -> INACTIVE/ARCHIVED/
 * ENDED) is never blocked by this check — only a hard DELETE is.
 *
 * `dependents` is a small, named breakdown (not just a total) so the error
 * message can say *what* still references the entity, matching this
 * codebase's existing preference for specific, actionable error text over a
 * generic "cannot delete."
 */
export function assertNoDependents(entityType: string, dependents: Record<string, number>): void {
  const blocking = Object.entries(dependents).filter(([, count]) => count > 0);
  if (blocking.length === 0) return;

  const summary = blocking.map(([label, count]) => `${count} ${label}`).join(', ');
  throw new AppHttpException({
    code: 'ACADEMIC_STRUCTURE_HAS_DEPENDENTS',
    message: `Cannot delete this ${entityType}: it is still referenced by ${summary}. Deactivate it instead.`,
    details: { entityType, dependents: Object.fromEntries(blocking) },
  });
}
