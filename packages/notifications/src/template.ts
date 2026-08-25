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
}

export interface TemplateDefinition {
  name: string;
  /** May contain {{variable}} tokens, resolved against the render() call's variables. */
  subject: string;
  text: string;
  html?: string;
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
    };
  }
}
