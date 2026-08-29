import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportResult } from './import-result';
import { useDownloadImportErrors } from '@/lib/imports/use-import-download';

vi.mock('@/lib/imports/use-import-download', () => ({
  useDownloadImportErrors: vi.fn(),
}));

const mockUseDownloadImportErrors = vi.mocked(useDownloadImportErrors);

describe('ImportResult', () => {
  beforeEach(() => {
    mockUseDownloadImportErrors.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it('shows the committed count for a COMPLETED job (DoD item 9)', () => {
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 1500,
          validRows: 1487,
          invalidRows: 13,
          committedRows: 1487,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.getByText(/1,487 of 1,500 students imported/)).toBeInTheDocument();
  });

  it('marks completed question imports as drafts pending review (DoD item 10)', () => {
    render(
      <ImportResult
        type="QUESTIONS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 10,
          invalidRows: 0,
          committedRows: 10,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.getByText('Draft — pending review')).toBeInTheDocument();
    expect(screen.getByText(/won.t appear in an exam until/i)).toBeInTheDocument();
  });

  it('offers an error-file download only when some rows were skipped', () => {
    const { rerender } = render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 10,
          invalidRows: 0,
          committedRows: 10,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /download error file/i })).not.toBeInTheDocument();

    rerender(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 8,
          invalidRows: 2,
          committedRows: 8,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /download error file/i })).toBeInTheDocument();
  });

  it('triggers the download mutation with the job id', async () => {
    const mutate = vi.fn();
    mockUseDownloadImportErrors.mockReturnValue({ mutate, isPending: false } as never);
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job-42"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 8,
          invalidRows: 2,
          committedRows: 8,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /download error file/i }));
    expect(mutate).toHaveBeenCalledWith('job-42');
  });

  it('shows the failure reason for a FAILED job', () => {
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'FAILED',
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          committedRows: 0,
          failedRows: 0,
          failureReason: 'The template version is out of date.',
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.getByText('The template version is out of date.')).toBeInTheDocument();
  });

  it('shows an expiry message for an EXPIRED job', () => {
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'EXPIRED',
          totalRows: 10,
          validRows: 8,
          invalidRows: 2,
          committedRows: 0,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
      />,
    );
    expect(screen.getByText(/expired before it was confirmed/i)).toBeInTheDocument();
  });

  it('calls onStartAnother when "Import another file" is clicked', async () => {
    const onStartAnother = vi.fn();
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 10,
          invalidRows: 0,
          committedRows: 10,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={onStartAnother}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /import another file/i }));
    expect(onStartAnother).toHaveBeenCalled();
  });

  it('renders a Done link to the directory when goToDirectoryHref is given', () => {
    render(
      <ImportResult
        type="STUDENTS"
        jobId="job1"
        job={{
          status: 'COMPLETED',
          totalRows: 10,
          validRows: 10,
          invalidRows: 0,
          committedRows: 10,
          failedRows: 0,
          failureReason: null,
        }}
        onStartAnother={vi.fn()}
        goToDirectoryHref="/school/people/students"
      />,
    );
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute(
      'href',
      '/school/people/students',
    );
  });
});
