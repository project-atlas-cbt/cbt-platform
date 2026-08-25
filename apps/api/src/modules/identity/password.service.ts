import { Injectable } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

// OWASP-recommended profile, and @node-rs/argon2's own library default
// (memoryCost: 19456 KiB, timeCost: 2, parallelism: 1) — passed explicitly
// so a future library default change can't silently weaken this, per 09
// §24's Argon2id requirement.
//
// `Algorithm` is an *ambient* const enum (@node-rs/argon2's .d.ts declares
// it, ships no runtime value) — under isolatedModules, referencing
// `Algorithm.Argon2id` as a value is a compile error because there's
// nothing to inline it from. `2` is that enum's own documented value for
// Argon2id (see its .d.ts: Argon2d=0, Argon2i=1, Argon2id=2 "default value,
// this is the default algorithm for normative recommendations").
const ARGON2ID = 2 as Algorithm;
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// A verify() call against a syntactically-valid but never-issued hash, run
// whenever login can't find a real one to check against (unknown
// identifier, no password set yet). Keeps failure-path timing close to a
// real wrong-password check instead of returning early — see
// IdentityService.evaluateLogin's enumeration-resistance comment.
const DUMMY_HASH_PROMISE = hash(
  'atlas-dummy-password-for-constant-time-comparison',
  ARGON2_OPTIONS,
);

@Injectable()
export class PasswordService {
  hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, plaintext: string): Promise<boolean> {
    return verify(passwordHash, plaintext, ARGON2_OPTIONS);
  }

  /** See DUMMY_HASH_PROMISE — always awaited, never short-circuited. */
  async verifyDummy(): Promise<void> {
    const dummyHash = await DUMMY_HASH_PROMISE;
    await verify(dummyHash, 'irrelevant', ARGON2_OPTIONS);
  }

  /**
   * A system-generated initial password for accounts that don't set their
   * own (students — ADR-0019/A-02). Not a security-critical secret at
   * generation time in the way a session token is (it's about to be shown
   * once, on a printed/downloaded credential sheet, and MUST_CHANGE_PASSWORD
   * forces it to be replaced before any real use) but still drawn from a
   * CSPRNG and kept unambiguous (no 0/O/1/l) for a student to type
   * correctly off a printed sheet.
   */
  generateInitialPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }
}
