import { Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * Every create/update in this module that touches a `@@unique` constraint
 * (class identity within a session, department/subject codes, term
 * sequence, a subject offered twice to one class, …) needs the same
 * translation: a raw Postgres unique-violation must never reach the client
 * as an unhandled 500 — found by this phase's own integration tests (the
 * duplicate-class-identity test), not by inspection. `runUniqueGuarded`
 * centralises the P2002 -> clean CONFLICT mapping so every service calls
 * one thing instead of repeating the same try/catch seven times.
 */
export async function runUniqueGuarded<T>(
  fn: () => Promise<T>,
  conflictMessage: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppHttpException({ code: 'CONFLICT', message: conflictMessage });
    }
    throw error;
  }
}
