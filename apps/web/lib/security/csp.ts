const DIRECTIVES: ReadonlyArray<readonly [string, string[]]> = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  ['img-src', ["'self'", 'blob:', 'data:', 'https:']],
  ['font-src', ["'self'", 'data:']],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['worker-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
];

/**
 * Nonce-based CSP for Next.js. Script execution has no `unsafe-inline`
 * escape hatch; Next receives the nonce through the request header and adds
 * it to framework scripts.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  apiOrigin?: string,
  production = false,
): string {
  const connectSources = ["'self'", ...(apiOrigin ? [apiOrigin] : [])];
  if (!production) {
    connectSources.push('ws:', 'http:');
  }
  const directives: Array<readonly [string, readonly string[]]> = [
    ...DIRECTIVES,
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]],
    ['connect-src', connectSources],
    ...(production ? ([['upgrade-insecure-requests', []]] as const) : []),
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`.trim()).join('; ');
}
