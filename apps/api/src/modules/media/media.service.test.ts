import { describe, expect, it } from 'vitest';
import { MediaService } from './media.service.js';
import type { ObjectStorageService } from '../../storage/object-storage.service.js';

// buildStorageKey is pure (no I/O) — the storage service is never called
// by it, so a stub satisfying the type (never invoked) is enough.
const unusedStorage = {} as ObjectStorageService;

describe('MediaService.buildStorageKey', () => {
  const service = new MediaService(unusedStorage);

  it('places each type under its own school-namespaced folder (09 §22)', () => {
    expect(service.buildStorageKey('school-1', 'SCHOOL_LOGO', 'asset-1', 'logo.png')).toBe(
      'schools/school-1/branding/asset-1/logo.png',
    );
    expect(service.buildStorageKey('school-1', 'QUESTION_IMAGE', 'asset-2', 'q.png')).toBe(
      'schools/school-1/questions/asset-2/q.png',
    );
    expect(service.buildStorageKey('school-1', 'QUESTION_DIAGRAM', 'asset-3', 'd.png')).toBe(
      'schools/school-1/questions/asset-3/d.png',
    );
    expect(service.buildStorageKey('school-1', 'OTHER', 'asset-4', 'f.bin')).toBe(
      'schools/school-1/other/asset-4/f.bin',
    );
  });

  it('is unique per upload by construction — same filename, different asset id, different key', () => {
    const a = service.buildStorageKey('school-1', 'QUESTION_IMAGE', 'asset-a', 'same.png');
    const b = service.buildStorageKey('school-1', 'QUESTION_IMAGE', 'asset-b', 'same.png');
    expect(a).not.toBe(b);
  });

  it('sanitizes the filename — strips path separators and unsafe characters', () => {
    expect(service.buildStorageKey('school-1', 'OTHER', 'asset-5', '../../etc/passwd')).toBe(
      'schools/school-1/other/asset-5/passwd',
    );
    expect(service.buildStorageKey('school-1', 'OTHER', 'asset-6', 'weird name!@#.png')).toBe(
      'schools/school-1/other/asset-6/weird_name___.png',
    );
  });

  it('falls back to a safe default name when nothing is left after stripping path separators', () => {
    expect(service.buildStorageKey('school-1', 'OTHER', 'asset-7', '')).toBe(
      'schools/school-1/other/asset-7/file',
    );
    expect(service.buildStorageKey('school-1', 'OTHER', 'asset-8', '/')).toBe(
      'schools/school-1/other/asset-8/file',
    );
  });
});
