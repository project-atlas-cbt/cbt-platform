import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestionMediaUpload } from './use-question-media-upload';
import {
  useAttachQuestionMedia,
  useCompleteQuestionMediaUpload,
  useRequestQuestionMediaUpload,
} from './mutations';

vi.mock('./mutations', () => ({
  useRequestQuestionMediaUpload: vi.fn(),
  useCompleteQuestionMediaUpload: vi.fn(),
  useAttachQuestionMedia: vi.fn(),
}));

const mockRequest = vi.mocked(useRequestQuestionMediaUpload);
const mockComplete = vi.mocked(useCompleteQuestionMediaUpload);
const mockAttach = vi.mocked(useAttachQuestionMedia);

const FILE = new File(['x'], 'diagram.png', { type: 'image/png' });
const CONTEXT = {
  type: 'QUESTION_IMAGE' as const,
  subjectId: 'sub1',
  level: 'SS2' as const,
  displayOrder: 0,
};

describe('useQuestionMediaUpload', () => {
  const requestMutateAsync = vi.fn();
  const completeMutateAsync = vi.fn();
  const attachMutateAsync = vi.fn();

  beforeEach(() => {
    requestMutateAsync.mockReset();
    completeMutateAsync.mockReset();
    attachMutateAsync.mockReset();
    mockRequest.mockReturnValue({ mutateAsync: requestMutateAsync } as never);
    mockComplete.mockReturnValue({ mutateAsync: completeMutateAsync } as never);
    mockAttach.mockReturnValue({ mutateAsync: attachMutateAsync } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('refuses to upload before a draft revision exists', async () => {
    const { result } = renderHook(() => useQuestionMediaUpload(undefined, undefined));
    let outcome;
    await act(async () => {
      outcome = await result.current.upload(FILE, CONTEXT);
    });
    expect(outcome).toBeNull();
    expect(result.current.error).toMatch(/save the question as a draft/i);
    expect(requestMutateAsync).not.toHaveBeenCalled();
  });

  it('runs the full upload-target -> PUT -> complete -> attach sequence', async () => {
    requestMutateAsync.mockResolvedValueOnce({
      mediaAssetId: 'media1',
      uploadUrl: 'https://storage.example/put',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    completeMutateAsync.mockResolvedValueOnce({ id: 'media1', status: 'READY' });
    attachMutateAsync.mockResolvedValueOnce({ id: 'attach1' });

    const { result } = renderHook(() => useQuestionMediaUpload('q1', 'rev1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.upload(FILE, CONTEXT);
    });

    expect(requestMutateAsync).toHaveBeenCalledWith({
      type: 'QUESTION_IMAGE',
      filename: 'diagram.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: FILE.size,
      subjectId: 'sub1',
      level: 'SS2',
    });
    expect(global.fetch).toHaveBeenCalledWith('https://storage.example/put', {
      method: 'PUT',
      body: FILE,
    });
    expect(completeMutateAsync).toHaveBeenCalledWith('media1');
    expect(attachMutateAsync).toHaveBeenCalledWith({ mediaAssetId: 'media1', displayOrder: 0 });
    expect(outcome).toMatchObject({ mediaAssetId: 'media1' });
    expect(result.current.error).toBeNull();
  });

  it('surfaces the rejection reason without attaching when validation rejects the file', async () => {
    requestMutateAsync.mockResolvedValueOnce({
      mediaAssetId: 'media1',
      uploadUrl: 'https://storage.example/put',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    completeMutateAsync.mockResolvedValueOnce({
      id: 'media1',
      status: 'REJECTED',
      rejectionReason: 'Not a real PNG file.',
    });

    const { result } = renderHook(() => useQuestionMediaUpload('q1', 'rev1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.upload(FILE, CONTEXT);
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toBe('Not a real PNG file.');
    expect(attachMutateAsync).not.toHaveBeenCalled();
  });

  it('surfaces a generic error when the raw PUT fails', async () => {
    requestMutateAsync.mockResolvedValueOnce({
      mediaAssetId: 'media1',
      uploadUrl: 'https://storage.example/put',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { result } = renderHook(() => useQuestionMediaUpload('q1', 'rev1'));
    let outcome;
    await act(async () => {
      outcome = await result.current.upload(FILE, CONTEXT);
    });

    expect(outcome).toBeNull();
    expect(result.current.error).toMatch(/could not upload/i);
    expect(completeMutateAsync).not.toHaveBeenCalled();
  });
});
