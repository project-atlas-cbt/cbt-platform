/**
 * ADR-0019's "template pipeline" — a minimal, provider-agnostic template
 * registry and renderer. B0 delivers the mechanism only; it ships no real
 * product templates (activation key, password reset, staff invitation,
 * expiry warning) — those belong to the phases that actually send those
 * messages (B1, B3, B10), which register their own templates against this
 * same registry rather than inventing a second rendering mechanism.
 */
export interface RenderedTemplate {
  subject: string;
  text: string;
  html?: string;
  attachments?: readonly TemplateAttachment[];
}

/**
 * ADR-0019 amendment (2026-10-12): a template may carry static attachments,
 * the same bytes on every send (an onboarding guide, say). They belong to
 * the template, not the message, so the dispatch queue payload stays small
 * and no caller can attach arbitrary content. Registration rejects anything
 * that is not a PDF within the size cap; widening is a change to the two
 * constants below plus a test.
 */
export interface TemplateAttachment {
  /** Shown to the recipient; no path separators or control characters. */
  filename: string;
  contentType: 'application/pdf';
  content: Uint8Array;
}

export const ALLOWED_ATTACHMENT_TYPES: readonly string[] = ['application/pdf'];
/** Per attachment and per template in total (providers cap whole messages, ZeptoMail at 15 MB). */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TEMPLATE = 3;

export class InvalidAttachmentError extends Error {
  constructor(templateName: string, reason: string) {
    super(`Template "${templateName}" has an invalid attachment: ${reason}.`);
    this.name = 'InvalidAttachmentError';
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const FILENAME_RE = /^[\w][\w .()-]{0,98}\.pdf$/i;

export function validateAttachments(
  templateName: string,
  attachments: readonly TemplateAttachment[],
): void {
  if (attachments.length > MAX_ATTACHMENTS_PER_TEMPLATE) {
    throw new InvalidAttachmentError(
      templateName,
      `at most ${MAX_ATTACHMENTS_PER_TEMPLATE} attachments are allowed`,
    );
  }
  let total = 0;
  for (const a of attachments) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(a.contentType)) {
      throw new InvalidAttachmentError(templateName, `type "${a.contentType}" is not allowed`);
    }
    if (!FILENAME_RE.test(a.filename)) {
      throw new InvalidAttachmentError(templateName, `file name "${a.filename}" is not allowed`);
    }
    if (a.content.byteLength === 0 || !PDF_MAGIC.every((b, i) => a.content[i] === b)) {
      throw new InvalidAttachmentError(templateName, `"${a.filename}" is not a PDF`);
    }
    total += a.content.byteLength;
    if (a.content.byteLength > MAX_ATTACHMENT_BYTES || total > MAX_ATTACHMENT_BYTES) {
      throw new InvalidAttachmentError(
        templateName,
        `attachments exceed ${MAX_ATTACHMENT_BYTES} bytes`,
      );
    }
  }
}

export interface TemplateDefinition {
  name: string;
  /** May contain {{variable}} tokens, resolved against the render() call's variables. */
  subject: string;
  text: string;
  html?: string;
  /** Static, validated at registration (see TemplateAttachment). */
  attachments?: readonly TemplateAttachment[];
}

export class UnknownTemplateError extends Error {
  constructor(name: string) {
    super(`Unknown notification template: "${name}". Register it before rendering.`);
    this.name = 'UnknownTemplateError';
  }
}

export class MissingTemplateVariableError extends Error {
  constructor(templateName: string, variable: string) {
    super(`Template "${templateName}" references "{{${variable}}}", which was not supplied.`);
    this.name = 'MissingTemplateVariableError';
  }
}

/**
 * `{{token}}` substitution — deliberately not a general templating engine
 * (no conditionals, no loops). Notification templates are short,
 * structured messages; anything requiring more than variable substitution
 * is a sign the message belongs in a real HTML template file, a decision
 * left to whichever phase first needs it.
 */
const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function interpolate(
  template: string,
  variables: Record<string, string | number>,
  templateNameForErrors: string,
): string {
  return template.replace(TOKEN_RE, (_match, key: string) => {
    if (!(key in variables)) {
      throw new MissingTemplateVariableError(templateNameForErrors, key);
    }
    return String(variables[key]);
  });
}

export class TemplateRegistry {
  private readonly templates = new Map<string, TemplateDefinition>();

  register(definition: TemplateDefinition): void {
    if (definition.attachments) {
      validateAttachments(definition.name, definition.attachments);
    }
    this.templates.set(definition.name, definition);
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  render(name: string, variables: Record<string, string | number> = {}): RenderedTemplate {
    const definition = this.templates.get(name);
    if (!definition) {
      throw new UnknownTemplateError(name);
    }
    // exactOptionalPropertyTypes: `html` must be omitted entirely when the
    // definition has none, not present-with-value-undefined — a spread of
    // a conditionally-empty object is how TS distinguishes the two here.
    return {
      subject: interpolate(definition.subject, variables, name),
      text: interpolate(definition.text, variables, name),
      ...(definition.html !== undefined
        ? { html: interpolate(definition.html, variables, name) }
        : {}),
      ...(definition.attachments?.length ? { attachments: definition.attachments } : {}),
    };
  }
}
