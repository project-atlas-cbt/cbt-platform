import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextEditor } from './rich-text-editor';

describe('RichTextEditor', () => {
  it('renders the initial value and toolbar', () => {
    render(<RichTextEditor value="<p>Hello</p>" onChange={vi.fn()} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulleted list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument();
  });

  it('disables the toolbar when disabled', () => {
    render(<RichTextEditor value="<p>Hello</p>" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  });
});
