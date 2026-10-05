import { describe, expect, it } from 'vitest';
import { buildOpenApiConfig } from './document.js';

describe('buildOpenApiConfig', () => {
  it('titles the API with the configured product name', () => {
    expect(buildOpenApiConfig('ExamKeep').info.title).toBe('ExamKeep API');
  });
});
