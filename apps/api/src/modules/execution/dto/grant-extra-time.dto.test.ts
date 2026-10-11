import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MAX_EXAM_DURATION_SECONDS } from '@atlas/domain';
import { GrantExtraTimeDto } from './attempt.dto.js';

const errorsFor = (extraTimeSeconds: unknown) =>
  validateSync(plainToInstance(GrantExtraTimeDto, { extraTimeSeconds }));

describe('GrantExtraTimeDto', () => {
  it('accepts zero up to one exam-day of extra time', () => {
    expect(errorsFor(0)).toHaveLength(0);
    expect(errorsFor(MAX_EXAM_DURATION_SECONDS)).toHaveLength(0);
  });

  it('rejects negative, fractional and oversized grants', () => {
    expect(errorsFor(-1)).not.toHaveLength(0);
    expect(errorsFor(1.5)).not.toHaveLength(0);
    expect(errorsFor(MAX_EXAM_DURATION_SECONDS + 1)).not.toHaveLength(0);
    expect(errorsFor(2_147_483_647)).not.toHaveLength(0);
  });
});
