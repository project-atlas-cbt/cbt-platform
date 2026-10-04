/**
 * ADR-0019: transactional email now, behind an abstraction that makes SMS
 * additive later without touching call sites. `to` is deliberately just a
 * string (an email address today) rather than a typed union, so adding an
 * SMS channel later is a new NotificationChannel implementation plus a new
 * `to` shape at the call site — never a change to this interface.
 */
export interface NotificationMessage {
  /** Recipient address — an email address for the only channel B0 ships. */
  to: string;
  /** A name registered in a TemplateRegistry (see template.ts). */
  template: string;
  /** Values substituted into the template's {{tokens}}. */
  variables?: Record<string, string | number>;
}

/**
 * The channel abstraction every notification call site depends on,
 * instead of a concrete provider. ConsoleNotificationChannel is the
 * dev/CI transport; B23 added Amazon SES (apps/api's SesNotificationChannel,
 * selected by NOTIFICATION_TRANSPORT). B1/B3/B10 are the phases that call
 * `send()` for real product messages (password reset, activation keys,
 * staff invitations, expiry warnings).
 */
export interface NotificationChannel {
  send(message: NotificationMessage): Promise<void>;
}
