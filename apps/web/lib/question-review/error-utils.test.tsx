import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import { describeReviewError, isSelfReviewForbidden } from './error-utils';

function apiError(code: string, message = 'Server message'): ApiError {
  return new ApiError({ code, message, retryable: false, correlationId: 'corr-1' });
}

describe('describeReviewError', () => {
  it('explains a self-review block with product-facing copy, not the raw server message', () => {
    render(<>{describeReviewError(apiError('QUESTION_SELF_REVIEW_FORBIDDEN'))}</>);
    expect(screen.getByText(/cannot review your own submissions/i)).toBeInTheDocument();
  });

  it('explains a stale-decision race', () => {
    render(<>{describeReviewError(apiError('QUESTION_REVISION_NOT_SUBMITTED'))}</>);
    expect(screen.getByText(/already decided/i)).toBeInTheDocument();
  });

  it('falls back to the server message for any other ApiError', () => {
    render(<>{describeReviewError(apiError('SOMETHING_ELSE', 'A specific server message'))}</>);
    expect(screen.getByText('A specific server message')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-ApiError throw', () => {
    render(<>{describeReviewError(new Error('boom'))}</>);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});

describe('isSelfReviewForbidden', () => {
  it('is true only for the self-review error code', () => {
    expect(isSelfReviewForbidden(apiError('QUESTION_SELF_REVIEW_FORBIDDEN'))).toBe(true);
    expect(isSelfReviewForbidden(apiError('QUESTION_REVISION_NOT_SUBMITTED'))).toBe(false);
    expect(isSelfReviewForbidden(new Error('boom'))).toBe(false);
  });
});
