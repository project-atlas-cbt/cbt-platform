import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vitest runs from apps/web (jsdom's import.meta.url is not a file: URL).
const source = readFileSync(resolve(process.cwd(), 'public/compat-probe.js'), 'utf8');

function runProbe() {
  // Executed exactly as the browser would load it: a classic script, in the
  // test's (jsdom) global context.
  runInThisContext(source);
}

describe('public/compat-probe.js (F20 DoD 12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.removeAttribute('data-app-ready');
    document.getElementById('atlas-unsupported-browser')?.remove();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays ES5: no arrow functions, let/const, classes, template literals or trailing call commas', () => {
    expect(source).not.toMatch(/=>|\blet\b|\bconst\b|\bclass\b|`|,\s*\)/);
  });

  it('shows a static notice when the app bundle never started', () => {
    runProbe();
    vi.advanceTimersByTime(5000);
    const notice = document.getElementById('atlas-unsupported-browser');
    expect(notice).not.toBeNull();
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.textContent).toMatch(/Firefox ESR/);
    // F21: the notice links to the full unsupported-browser page.
    expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/unsupported-browser');
  });

  it('stays silent when the app is running', () => {
    document.documentElement.setAttribute('data-app-ready', '');
    runProbe();
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('atlas-unsupported-browser')).toBeNull();
  });
});
