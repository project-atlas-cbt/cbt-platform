import { Injectable, Logger } from '@nestjs/common';

/** Dynamically-generated break-glass action strings
 * (`BREAK_GLASS_<PERMISSION_ID>`, see `BreakGlassService`) are exempt from
 * registration — that family is generated from the permission table, not
 * enumerable ahead of time the way every other module's fixed action
 * strings are. */
const BREAK_GLASS_PREFIX = 'BREAK_GLASS_';

/**
 * B10: the single source of truth for which `AuditEvent.action` strings a
 * running app actually emits — mirroring `ScopeResolverRegistry`'s and
 * `@atlas/notifications`' `TemplateRegistry`'s established `register`/`has`
 * idiom exactly.
 *
 * Each module that calls `AuditService.record()` registers the literal
 * strings it emits from its own small `OnModuleInit` provider (see e.g.
 * `academics/audit-action-registration.provider.ts`) — the source of truth
 * lives with the module that owns the action, not a central hand-
 * maintained list. `AuditVocabularyCoverageService` then diffs this
 * registry's contents against `CANONICAL_AUDIT_ACTIONS`'
 * (`packages/domain/src/audit/vocabulary.ts`) `LIVE` entries on every app
 * boot.
 */
@Injectable()
export class AuditActionRegistry {
  private readonly known = new Set<string>();
  private readonly warned = new Set<string>();
  private readonly logger = new Logger('AuditActionRegistry');

  register(action: string): void {
    this.known.add(action);
  }

  /** Convenience for a module registering many actions at once. */
  registerAll(actions: string[]): void {
    for (const action of actions) this.register(action);
  }

  has(action: string): boolean {
    return this.known.has(action);
  }

  allKnown(): readonly string[] {
    return [...this.known];
  }

  /** Called by `AuditService.record()` for every write — warns once per
   * distinct unknown action (deduped for the life of the process, not
   * once per write) so a genuine registration gap is loud in logs without
   * flooding them, and without ever hard-failing a write path over a
   * missing registration. Never warns for the generated `BREAK_GLASS_*`
   * family. */
  warnIfUnknown(action: string): void {
    if (action.startsWith(BREAK_GLASS_PREFIX)) return;
    if (this.known.has(action)) return;
    if (this.warned.has(action)) return;
    this.warned.add(action);
    this.logger.warn(
      `AuditEvent.action "${action}" was written without being registered in AuditActionRegistry — ` +
        'the module that emits it should call registry.register(...) from its own OnModuleInit provider.',
    );
  }
}
