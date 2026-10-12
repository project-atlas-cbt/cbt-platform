import { describe, expect, it } from 'vitest';
import {
  InvalidAttachmentError,
  MAX_ATTACHMENT_BYTES,
  MissingTemplateVariableError,
  TemplateRegistry,
  UnknownTemplateError,
  interpolate,
} from './template.js';

describe('interpolate', () => {
  it('substitutes every {{token}} with its variable', () => {
    expect(interpolate('Hello {{name}}, code {{code}}.', { name: 'Ada', code: 42 }, 'test')).toBe(
      'Hello Ada, code 42.',
    );
  });

  it('throws MissingTemplateVariableError for an unresolved token', () => {
    expect(() => interpolate('Hello {{name}}.', {}, 'greeting')).toThrow(
      MissingTemplateVariableError,
    );
  });

  it('leaves a string with no tokens unchanged', () => {
    expect(interpolate('No tokens here.', {}, 'test')).toBe('No tokens here.');
  });
});

describe('TemplateRegistry', () => {
  it('renders a registered template, substituting subject and text', () => {
    const registry = new TemplateRegistry();
    registry.register({
      name: 'welcome',
      subject: 'Welcome, {{name}}',
      text: 'Hi {{name}}, your code is {{code}}.',
    });

    const rendered = registry.render('welcome', { name: 'Ada', code: '123456' });
    expect(rendered.subject).toBe('Welcome, Ada');
    expect(rendered.text).toBe('Hi Ada, your code is 123456.');
    expect(rendered.html).toBeUndefined();
  });

  it('renders the html variant when the template defines one', () => {
    const registry = new TemplateRegistry();
    registry.register({
      name: 'with-html',
      subject: 'Subject',
      text: 'Text {{name}}',
      html: '<p>Hi {{name}}</p>',
    });

    expect(registry.render('with-html', { name: 'Ada' }).html).toBe('<p>Hi Ada</p>');
  });

  it('omits html entirely (not html: undefined) when the template has none', () => {
    const registry = new TemplateRegistry();
    registry.register({ name: 'text-only', subject: 'S', text: 'T' });
    const rendered = registry.render('text-only');
    expect('html' in rendered).toBe(false);
  });

  it('throws UnknownTemplateError for an unregistered template name', () => {
    const registry = new TemplateRegistry();
    expect(() => registry.render('does-not-exist')).toThrow(UnknownTemplateError);
  });

  it('has() reports whether a template is registered', () => {
    const registry = new TemplateRegistry();
    expect(registry.has('welcome')).toBe(false);
    registry.register({ name: 'welcome', subject: 'S', text: 'T' });
    expect(registry.has('welcome')).toBe(true);
  });
});

describe('TemplateRegistry attachments (ADR-0019 amendment, 2026-10-12)', () => {
  const pdf = (extra = 0) =>
    Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Array<number>(extra).fill(0x20)]);
  const base = { name: 'guide', subject: 'S', text: 'T' };
  const file = (over: Record<string, unknown> = {}) => ({
    filename: 'Guide.pdf',
    contentType: 'application/pdf' as const,
    content: pdf(),
    ...over,
  });

  it('renders a registered PDF attachment', () => {
    const r = new TemplateRegistry();
    r.register({ ...base, attachments: [file()] });
    expect(r.render('guide').attachments?.map((a) => a.filename)).toEqual(['Guide.pdf']);
  });

  it('omits attachments for templates without any', () => {
    const r = new TemplateRegistry();
    r.register(base);
    expect(r.render('guide')).not.toHaveProperty('attachments');
  });

  it.each([
    ['a non-PDF type', file({ contentType: 'image/png' })],
    ['content that is not a PDF', file({ content: Uint8Array.from([1, 2, 3, 4, 5, 6]) })],
    ['empty content', file({ content: new Uint8Array() })],
    ['a path in the file name', file({ filename: '../x.pdf' })],
    ['a non-pdf extension', file({ filename: 'guide.exe' })],
    ['a file over the size cap', file({ content: pdf(MAX_ATTACHMENT_BYTES) })],
  ])('rejects %s at registration', (_label, attachment) => {
    const r = new TemplateRegistry();
    expect(() => r.register({ ...base, attachments: [attachment as never] })).toThrow(
      InvalidAttachmentError,
    );
    expect(r.has('guide')).toBe(false);
  });

  it('rejects more than three attachments', () => {
    const r = new TemplateRegistry();
    expect(() => r.register({ ...base, attachments: [file(), file(), file(), file()] })).toThrow(
      InvalidAttachmentError,
    );
  });

  it('rejects attachments whose total is over the cap', () => {
    const r = new TemplateRegistry();
    const big = file({ content: pdf(MAX_ATTACHMENT_BYTES / 2 + 10) });
    expect(() => r.register({ ...base, attachments: [big, big] })).toThrow(InvalidAttachmentError);
  });
});
