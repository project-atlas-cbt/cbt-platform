import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileDropzone } from './file-dropzone';

function makeFile(name: string, sizeBytes: number, type = 'text/csv'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('FileDropzone', () => {
  it('accepts a valid .csv file under the size cap', async () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const input = screen.getByLabelText(/choose a file to import/i);
    const file = makeFile('students.csv', 1024);
    await userEvent.upload(input, file);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('accepts a valid .xlsx file, case-insensitively', async () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const input = screen.getByLabelText(/choose a file to import/i);
    const file = makeFile(
      'students.XLSX',
      1024,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    await userEvent.upload(input, file);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  // The OS file picker itself already restricts selectable files to the
  // `accept=".csv,.xlsx"` list (`userEvent.upload` respects it too, the
  // same as a real browser), so a mismatched file can only actually reach
  // this component via drag-and-drop, which carries no such restriction —
  // exactly the case this validation exists for.
  it('rejects a wrong-extension dropped file without calling onFileSelected', () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const dropzone = screen.getByRole('button');
    const file = makeFile('students.pdf', 1024, 'application/pdf');
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/csv or \.xlsx/i);
  });

  it('rejects a dropped file larger than 5MB without calling onFileSelected', () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const dropzone = screen.getByRole('button');
    const file = makeFile('students.csv', 6 * 1024 * 1024);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/larger than 5mb/i);
  });

  it('accepts a valid file dropped onto the dropzone', () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const dropzone = screen.getByRole('button');
    const file = makeFile('students.csv', 1024);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('is keyboard-operable', () => {
    render(<FileDropzone onFileSelected={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
  });

  it('disables interaction when disabled', () => {
    render(<FileDropzone onFileSelected={vi.fn()} disabled />);
    const region = screen.getByRole('button');
    expect(region).toHaveAttribute('aria-disabled', 'true');
    expect(region).toHaveAttribute('tabIndex', '-1');
  });
});
