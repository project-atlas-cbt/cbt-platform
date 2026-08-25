import { describe, expect, it } from 'vitest';
import { ConsoleNotificationChannel } from './console-channel.js';
import { TemplateRegistry } from './template.js';

describe('ConsoleNotificationChannel (ADR-0019 dev/console provider)', () => {
  it('renders the template and writes it through the injected sink', async () => {
    const registry = new TemplateRegistry();
    registry.register({
      name: 'password-reset',
      subject: 'Reset your password',
      text: 'Use this link: {{link}}',
    });

    const lines: string[] = [];
    const channel = new ConsoleNotificationChannel(registry, (line) => lines.push(line));

    await channel.send({
      to: 'teacher@example.test',
      template: 'password-reset',
      variables: { link: 'https://example.test/reset/abc123' },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('teacher@example.test');
    expect(lines[0]).toContain('Reset your password');
    expect(lines[0]).toContain('https://example.test/reset/abc123');
  });

  it('propagates an unknown-template failure rather than sending silently', async () => {
    const channel = new ConsoleNotificationChannel(new TemplateRegistry(), () => {});
    await expect(channel.send({ to: 'x@example.test', template: 'nope' })).rejects.toThrow(
      /Unknown notification template/,
    );
  });
});
