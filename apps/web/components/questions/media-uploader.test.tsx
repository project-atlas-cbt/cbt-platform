import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaUploader } from './media-uploader';
import { useDetachQuestionMedia } from '@/lib/questions/mutations';
import { useQuestionMediaUpload } from '@/lib/questions/use-question-media-upload';
import { useMediaUrl } from '@/lib/questions/queries';

vi.mock('@/lib/questions/mutations', () => ({ useDetachQuestionMedia: vi.fn() }));
vi.mock('@/lib/questions/use-question-media-upload', () => ({ useQuestionMediaUpload: vi.fn() }));
vi.mock('@/lib/questions/queries', () => ({ useMediaUrl: vi.fn() }));

const mockUseDetach = vi.mocked(useDetachQuestionMedia);
const mockUseUpload = vi.mocked(useQuestionMediaUpload);
const mockUseMediaUrl = vi.mocked(useMediaUrl);

describe('MediaUploader', () => {
  beforeEach(() => {
    mockUseDetach.mockReturnValue({ mutateAsync: vi.fn() } as never);
    mockUseUpload.mockReturnValue({ upload: vi.fn(), uploading: false, error: null });
    mockUseMediaUrl.mockReturnValue({
      isPending: false,
      isError: false,
      data: { url: 'https://cdn.example/img.png', expiresAt: '2026-01-01T00:00:00Z' },
    } as never);
  });

  it('disables attaching until a draft revision exists', () => {
    render(
      <MediaUploader
        questionId={undefined}
        revisionId={undefined}
        subjectId={undefined}
        level={undefined}
        media={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /attach media/i })).toBeDisabled();
    expect(screen.getByText(/save this question as a draft/i)).toBeInTheDocument();
  });

  it('enables attaching once a revision, subject, and level are all known', () => {
    render(
      <MediaUploader questionId="q1" revisionId="rev1" subjectId="sub1" level="SS2" media={[]} />,
    );
    expect(screen.getByRole('button', { name: /attach media/i })).not.toBeDisabled();
  });

  it('shows an upload error message', () => {
    mockUseUpload.mockReturnValue({
      upload: vi.fn(),
      uploading: false,
      error: 'Could not upload this file.',
    });
    render(
      <MediaUploader questionId="q1" revisionId="rev1" subjectId="sub1" level="SS2" media={[]} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not upload this file.');
  });

  it('renders every attached item with a remove control', () => {
    render(
      <MediaUploader
        questionId="q1"
        revisionId="rev1"
        subjectId="sub1"
        level="SS2"
        media={[{ id: 'm1', mediaAssetId: 'asset1', mediaType: 'QUESTION_IMAGE', displayOrder: 0 }]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example/img.png');
    expect(screen.getByRole('button', { name: /remove attachment/i })).toBeInTheDocument();
  });
});
