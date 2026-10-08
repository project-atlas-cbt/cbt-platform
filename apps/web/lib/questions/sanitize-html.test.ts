import { describe, expect, it } from 'vitest';
import { sanitizeQuestionHtml, stripHtmlToText } from './sanitize-html';

describe('sanitizeQuestionHtml', () => {
  it('preserves the allowed formatting tags', () => {
    const html = '<p>Solve <strong>2x + 3 = 7</strong> for <em>x</em>.</p>';
    expect(sanitizeQuestionHtml(html)).toBe(html);
  });

  it('preserves subscript and superscript', () => {
    const html = '<p>H<sub>2</sub>O and x<sup>2</sup></p>';
    expect(sanitizeQuestionHtml(html)).toBe(html);
  });

  it('preserves lists', () => {
    const html = '<ul><li>One</li><li>Two</li></ul>';
    expect(sanitizeQuestionHtml(html)).toBe(html);
  });

  it('strips script tags entirely', () => {
    const html = '<p>Hi</p><script>alert("x")</script>';
    const result = sanitizeQuestionHtml(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('strips event-handler attributes', () => {
    const html = '<p onclick="alert(1)">Hi</p>';
    const result = sanitizeQuestionHtml(html);
    expect(result).not.toContain('onclick');
  });

  it('strips disallowed tags like <img> and <a>', () => {
    const html = '<p>Hi <img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a></p>';
    const result = sanitizeQuestionHtml(html);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('<a');
    expect(result).not.toContain('onerror');
  });
});

describe('stripHtmlToText', () => {
  it('returns the plain text content', () => {
    expect(stripHtmlToText('<p>Solve <strong>2x</strong></p>')).toBe('Solve 2x');
  });

  it('treats an empty Tiptap paragraph as empty', () => {
    expect(stripHtmlToText('<p></p>')).toBe('');
  });

  it('trims whitespace-only content to empty', () => {
    expect(stripHtmlToText('<p>   </p>')).toBe('');
  });
});
