/** B22: the export failure reason staff see never carries raw error text. */
import { describe, expect, it } from 'vitest';
import { exportFailureReason } from './export.service.js';

describe('exportFailureReason (B22)', () => {
  it('says a service was unavailable for a storage outage, without the SDK message', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 10.0.3.7:9000 bucket atlas-prod'), {
      name: 'TimeoutError',
      $metadata: {},
    });
    const reason = exportFailureReason(err);
    expect(reason).toMatch(/temporarily unavailable/);
    expect(reason).not.toMatch(/10\.0\.3\.7|atlas-prod|ECONNREFUSED/);
  });

  it('gives a generic reason for anything else', () => {
    const reason = exportFailureReason(new Error('relation "results" does not exist'));
    expect(reason).not.toMatch(/relation|results/);
    expect(reason).toMatch(/could not be generated/);
  });
});
