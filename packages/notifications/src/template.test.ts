import { describe, expect, it } from 'vitest';
import {
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
