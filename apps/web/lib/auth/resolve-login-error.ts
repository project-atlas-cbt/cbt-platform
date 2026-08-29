import { ApiError, NetworkError } from '@/lib/api';

/**
 * Maps a failed login attempt's error into user-facing text.
 *
 * `UNAUTHENTICATED` — bad credentials, locked out, suspended/inactive
 * account, or (school login only) no tenant resolved for the request — is
 * deliberately shown as `genericMessage`, matching IdentityService
 * .evaluateLogin's/PlatformAuthService.evaluateLogin's own enumeration-
 * resistant collapse of every one of those outcomes into one identical
 * response (see evaluateLogin's own doc comment,
 * apps/api/src/modules/identity/identity.service.ts).
 *
 * Every other failure — a CSRF rejection (`FORBIDDEN`, most often the
 * pre-bootstrap race `<LoginForm>`/`<PlatformLoginForm>` now guard against
 * by disabling submission until the CSRF token exists), a DTO validation
 * error (`VALIDATION_ERROR`, e.g. a malformed email), a genuine network
 * failure, or an unexpected 5xx — is a *system* problem, not a login-outcome
 * one, and was never covered by that enumeration-resistance reasoning in the
 * first place. Collapsing it into the same generic text made every
 * non-credential failure indistinguishable from a wrong password — the
 * previous behaviour, and the reason a real CSRF/validation failure was
 * mistaken for bad credentials during testing. `ApiError.message` is always
 * the server's own ADR-0033 envelope message, safe to show verbatim.
 */
export function resolveLoginErrorMessage(err: unknown, genericMessage: string): string {
  if (err instanceof ApiError) {
    return err.code === 'UNAUTHENTICATED' ? genericMessage : err.message;
  }
  if (err instanceof NetworkError) {
    return err.message;
  }
  return genericMessage;
}
