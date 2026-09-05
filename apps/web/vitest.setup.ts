import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
// F13 — jsdom has no native IndexedDB; Dexie (lib/attempt/db.ts) needs a
// real (or faithfully faked) `indexedDB` global to run at all under Vitest.
import 'fake-indexeddb/auto';

// @testing-library/react's auto-cleanup only self-registers for Jest by
// default; under Vitest it must be wired explicitly, or DOM from one
// test's render() leaks into the next (causing spurious "multiple
// elements found" failures).
afterEach(() => {
  cleanup();
});

// Radix primitives (Select, Dialog's focus scope, etc.) call pointer-
// capture and scroll APIs jsdom doesn't implement — polyfilled globally
// once here rather than per test file.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
// Radix Checkbox's indicator sizing (`@radix-ui/react-use-size`) calls
// `ResizeObserver`, which jsdom doesn't implement either — only surfaces
// when a `<Checkbox>` mounts already `checked` (F4's "make this the
// current session" default-checked box is the first usage of that shape
// in this codebase; every prior `<Checkbox>` test starts unchecked).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// F9's Tiptap/ProseMirror editor (`RichTextEditor`) calls into real layout
// geometry APIs jsdom doesn't implement at all — `document.elementFromPoint`
// (used to resolve a mousedown's document position) and
// `Range.prototype.getClientRects` (used to compute caret/selection
// coordinates for scroll-into-view). Both are unreachable in jsdom's actual
// layout-less DOM, so these are inert stubs, not real geometry — sufficient
// for ProseMirror's own code paths to run without throwing during a test
// that types into the editor; genuine caret-position assertions aren't
// something this test suite needs (`question-editor-flow.integration.test.tsx`
// asserts on the resulting form/autosave payload, never pixel coordinates).
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
if (typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;
}
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;
}
