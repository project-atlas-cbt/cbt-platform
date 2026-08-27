/**
 * Extracted from storage.module.ts on purpose: storage.module.ts's own
 * factory provider needs this symbol, and object-storage.service.ts needs
 * it too (`@Inject(S3_CLIENT)`) — if each imported it from the other, the
 * circular ESM import leaves whichever module evaluates second with an
 * uninitialised binding at class-definition time (`@Inject` runs
 * immediately, not lazily), crashing with "Cannot access 'S3_CLIENT'
 * before initialization" the first time `node dist/main.js` actually ran
 * this (never surfaced by `tsc`/`tsx`/Vitest — see this project's standing
 * gotcha about `tsx` vs. a real compiled boot catching different bugs).
 */
export const S3_CLIENT = Symbol('S3_CLIENT');
