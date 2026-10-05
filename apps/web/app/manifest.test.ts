import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the installed app name from PRODUCT_NAME', () => {
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_NAME', 'ExamKeep');
    const m = manifest();
    expect(m.name).toBe('ExamKeep');
    expect(m.short_name).toBe('ExamKeep');
    expect(m.description).toContain('ExamKeep');
  });
});
