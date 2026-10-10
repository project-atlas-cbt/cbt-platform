import DOMPurify from 'dompurify';

/**
 * F9 — the first place this codebase renders arbitrary stored HTML back to
 * a browser. `content`/`explanation`/option text are authored via
 * `RichTextEditor` (Tiptap, `question-content-field.tsx`), which only ever
 * emits a known-safe subset of markup — but every read-only render (the
 * detail screen, revision history) sanitizes anyway as defense-in-depth,
 * since the value ultimately came from a stored string a future API
 * consumer, an older client, or a compromised session could have written
 * directly.
 *
 * The allow-list mirrors `RichTextEditor`'s own enabled marks/nodes exactly
 * (bold/italic/underline/subscript/superscript/lists/paragraphs) — nothing this component can
 * produce is excluded, and nothing beyond it is admitted.
 */
const ALLOWED_TAGS = ['p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'br', 'sub', 'sup'];

export function sanitizeQuestionHtml(html: string): string {
  if (typeof window === 'undefined') {
    // DOMPurify needs a real DOM; server-rendered previews are not a
    // scenario this app has (every question screen is 'use client'), so
    // this branch exists only to keep the function safely callable during
    // any future SSR pass rather than throwing.
    return '';
  }
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
}

/** Used by the autosave minimum-viable-fields gate and submit validation —
 * `content` (rich HTML) is only "non-empty" if it has real text, not just
 * an empty `<p></p>` Tiptap produces for an untouched editor. */
export function stripHtmlToText(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '').trim();
  const div = document.createElement('div');
  div.innerHTML = sanitizeQuestionHtml(html);
  return (div.textContent ?? '').trim();
}
