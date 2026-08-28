import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

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
