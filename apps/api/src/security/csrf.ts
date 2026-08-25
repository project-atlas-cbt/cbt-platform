import Tokens from '@fastify/csrf';

/**
 * @fastify/csrf@8.1.0's own type declarations are broken for the
 * `userInfo: true` variant: `Parameters<TokensConstructor>` /
 * `ReturnType<TokensConstructor>` (used to type the exported factory
 * function) collapse an overloaded type down to its last signature, so
 * the declared shape is always the no-userInfo `TokensSimple` regardless
 * of what's passed at the call site — confirmed against the package's own
 * `types/index.d.ts`. The runtime has no such bug (verified directly:
 * `new Tokens({userInfo:true}).verify(secret, token, wrongUserInfo)`
 * correctly returns `false`), so this is a type-only workaround for a
 * type-only defect, not a runtime assumption.
 */
interface TokensWithUserInfo {
  secretSync(): string;
  create(secret: string, userInfo: string): string;
  verify(secret: string, token: string, userInfo: string): boolean;
}
const TokensWithUserInfoCtor = Tokens as unknown as new (opts: {
  userInfo: true;
}) => TokensWithUserInfo;

/**
 * ADR-0022's double-submit CSRF primitive. Deliberately built on
 * `@fastify/csrf` (pure secret/token generation and verification, no
 * response-writing side effects) rather than `@fastify/csrf-protection` —
 * that plugin's enforcement hook writes its own raw Fastify error response
 * directly (`reply.send(new SomeFastifyError())`) on failure, bypassing
 * this project's ADR-0033 error envelope entirely. Using the lower-level
 * library lets CsrfMiddleware throw a normal AppHttpException instead, so
 * a CSRF failure looks like every other error the API returns.
 *
 * `userInfo: true` binds every token to a caller-supplied string —
 * ADR-0022's shared-parent-domain topology means many school subdomains
 * share one registrable domain, which is exactly the "cookie tossing
 * across untrusted subdomains" scenario `@fastify/csrf`'s own
 * documentation calls out userInfo as the mitigation for: a secret+token
 * pair minted under one school's tenant context must not verify under
 * another's, even if a compromised sibling subdomain could otherwise set
 * an arbitrary cookie value in the victim's browser. See
 * CsrfMiddleware for what the userInfo value actually is (the resolved
 * schoolId, or "platform" outside any tenant).
 */
const tokens = new TokensWithUserInfoCtor({ userInfo: true });

export const CSRF_COOKIE_NAME = '_csrf';
export const CSRF_TOKEN_HEADER = 'x-csrf-token';
export const PLATFORM_CSRF_USER_INFO = 'platform';

export function generateCsrfSecret(): string {
  return tokens.secretSync();
}

export function createCsrfToken(secret: string, userInfo: string): string {
  return tokens.create(secret, userInfo);
}

export function verifyCsrfToken(secret: string, token: string, userInfo: string): boolean {
  return tokens.verify(secret, token, userInfo);
}
