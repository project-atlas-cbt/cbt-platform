'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * F20 — the request's CSP nonce, for the `<style>` elements we render
 * ourselves on the client (the tenant `ThemeProvider`, the branding preview,
 * Tiptap's injected editor CSS). The root layout reads it from the `x-nonce`
 * request header (`proxy.ts`) and provides it here; Next stamps its own
 * scripts without help.
 *
 * Browsers hide a rendered element's `nonce` attribute from script (it reads
 * as ""), so the value cannot be recovered from the DOM — it has to travel
 * through React. `undefined` outside a nonce'd request (unit tests).
 */
const NonceContext = createContext<string | undefined>(undefined);

export function NonceProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  return <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>;
}

export function useNonce(): string | undefined {
  return useContext(NonceContext);
}
