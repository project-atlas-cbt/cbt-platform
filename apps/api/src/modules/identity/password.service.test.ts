import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService (Argon2id — 09 §24)', () => {
  const service = new PasswordService();

  it('hashes and verifies a round trip', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(await service.verify(hash, 'wrong password')).toBe(false);
  });

  it('produces a different hash for the same password each time (random salt)', async () => {
    const a = await service.hash('same password');
    const b = await service.hash('same password');
    expect(a).not.toBe(b);
  });

  it('verifyDummy resolves without throwing (constant-time comparison path)', async () => {
    await expect(service.verifyDummy()).resolves.toBeUndefined();
  });

  describe('generateInitialPassword', () => {
    it('generates a 10-character password from an unambiguous alphabet', () => {
      const password = service.generateInitialPassword();
      expect(password).toHaveLength(10);
      // No 0/O/1/l/I/o/i — easy to mis-type off a printed credential sheet.
      expect(password).not.toMatch(/[0O1lIoi]/);
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('generates distinct passwords across calls', () => {
      const passwords = new Set(
        Array.from({ length: 20 }, () => service.generateInitialPassword()),
      );
      expect(passwords.size).toBe(20);
    });
  });
});
