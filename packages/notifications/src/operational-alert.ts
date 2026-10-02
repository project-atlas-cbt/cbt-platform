import type { TemplateDefinition } from './template.js';

/**
 * B20: the operational/security alert message (Exam Health Monitor, 09
 * §37; break-glass use; auth-failure spikes), delivered to platform
 * operators (`OPS_ALERT_EMAILS`) through the same NotificationChannel as
 * every other message. Rendered by apps/api (which owns the registry);
 * apps/worker only enqueues it. Variables carry counts, ids and states —
 * never school names, people or answer content.
 */
export const OPERATIONAL_ALERT_TEMPLATE: TemplateDefinition = {
  name: 'operational-alert',
  subject: '[{{severity}}] {{title}} — {{transition}}',
  text: '{{summary}}\n\nAlert: {{alertKey}}\nState: {{transition}}\nAt: {{at}}',
};

export interface OperationalAlert {
  alertKey: string;
  severity: 'warning' | 'critical';
  title: string;
  summary: string;
  transition: 'FIRING' | 'RESOLVED' | 'EVENT';
}

export function operationalAlertVariables(
  alert: OperationalAlert,
  at: Date = new Date(),
): Record<string, string> {
  return {
    alertKey: alert.alertKey,
    severity: alert.severity.toUpperCase(),
    title: alert.title,
    summary: alert.summary,
    transition: alert.transition,
    at: at.toISOString(),
  };
}

/** `OPS_ALERT_EMAILS` → trimmed, non-empty addresses. */
export function parseOpsAlertRecipients(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
