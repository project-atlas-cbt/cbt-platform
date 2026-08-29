'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F9 — this codebase's first WYSIWYG dependency (Tiptap, confirmed with the
 * project owner over the plain `Textarea` primitive every other long-text
 * field uses, to satisfy `04 §39`/`05 §15.2`'s "rich editor"/"rich
 * formatting" wording directly).
 *
 * Enabled: bold, italic, underline, ordered/unordered lists, clear
 * formatting — `05 §15.2`'s content list ("Text / Image / Rich formatting")
 * doesn't call for document structure, so `StarterKit`'s other defaults
 * (headings, blockquotes, code blocks, horizontal rules, links) are
 * explicitly disabled below rather than left enabled-and-unused.
 *
 * Out of scope: equation/math notation (already deferred by F9's own
 * roadmap text) and inline images — all media goes through
 * `MediaUploader`/`QuestionMedia` (a separate attach/detach join row, not
 * an embedded `<img>` in `content`), so no image extension is added here.
 *
 * `content: string` stores sanitized HTML (`editor.getHTML()`), not
 * Tiptap's own JSON doc format — simpler, matches how CSV export already
 * treats `content` as flat text, and needs no schema-version field this
 * DTO doesn't have.
 */
export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  id?: string;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        id: id ?? '',
        class: 'min-h-32 px-3 py-2 text-sm text-text-primary focus:outline-none',
        ...(ariaInvalid !== undefined ? { 'aria-invalid': String(ariaInvalid) } : {}),
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
  });

  // Reconciles an external value change (e.g. `form.reset()` on data load)
  // back into the editor — guarded so the editor's own `onUpdate` firing
  // this same `value` back in doesn't create a feedback loop.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `editor` churn; only external `value` changes should trigger a reconcile.
  }, [value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return <div className="min-h-32 rounded-md border border-border bg-surface" />;
  }

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface',
        'focus-within:border-border-strong',
        ariaInvalid ? 'border-danger focus-within:border-danger' : undefined,
        disabled ? 'cursor-not-allowed opacity-50' : undefined,
      )}
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <ToolbarButton
          label="Bold"
          icon={Bold}
          active={editor.isActive('bold')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          icon={Italic}
          active={editor.isActive('italic')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Underline"
          icon={UnderlineIcon}
          active={editor.isActive('underline')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="Bulleted list"
          icon={List}
          active={editor.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          icon={ListOrdered}
          active={editor.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Clear formatting"
          icon={RemoveFormatting}
          disabled={disabled}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: typeof Bold;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm text-text-secondary transition-colors',
        'hover:bg-surface-muted hover:text-text-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        active && 'bg-surface-muted text-text-primary',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
