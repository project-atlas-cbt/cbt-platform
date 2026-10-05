import { TemplateRegistry, UnknownTemplateError } from '@atlas/notifications';
import type { SendEmailCommandInput } from '@aws-sdk/client-sesv2';
import { describe, expect, it, vi } from 'vitest';
import { SesNotificationChannel } from './ses-channel.js';

function registry() {
  const r = new TemplateRegistry();
  r.register({
    name: 'password.reset',
    subject: 'Reset for {{school}}',
    text: 'Open {{link}}',
    html: '<a href="{{link}}">Reset</a>',
  });
  return r;
}

describe('SesNotificationChannel (B23, ADR-0019)', () => {
  it('sends the rendered template from the configured identity', async () => {
    const sendEmail = vi.fn<(input: SendEmailCommandInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const channel = new SesNotificationChannel(
      registry(),
      'ExamKeep <no-reply@example.ng>',
      sendEmail,
    );
    await channel.send({
      to: 'admin@school.ng',
      template: 'password.reset',
      variables: { school: 'Kings', link: 'https://kings.example.ng/r/abc' },
    });
    expect(sendEmail).toHaveBeenCalledWith({
      FromEmailAddress: 'ExamKeep <no-reply@example.ng>',
      Destination: { ToAddresses: ['admin@school.ng'] },
      Content: {
        Simple: {
          Subject: { Data: 'Reset for Kings', Charset: 'UTF-8' },
          Body: {
            Text: { Data: 'Open https://kings.example.ng/r/abc', Charset: 'UTF-8' },
            Html: { Data: '<a href="https://kings.example.ng/r/abc">Reset</a>', Charset: 'UTF-8' },
          },
        },
      },
      EmailTags: [{ Name: 'template', Value: 'password_reset' }],
    });
  });

  it('rejects, so the dispatch queue retries, when SES fails', async () => {
    const channel = new SesNotificationChannel(registry(), 'no-reply@example.ng', () =>
      Promise.reject(new Error('Throttling')),
    );
    await expect(
      channel.send({
        to: 'a@b.ng',
        template: 'password.reset',
        variables: { school: 'K', link: 'x' },
      }),
    ).rejects.toThrow('Throttling');
  });

  it('rejects an unknown template without calling SES', async () => {
    const sendEmail = vi.fn(() => Promise.resolve({}));
    const channel = new SesNotificationChannel(registry(), 'no-reply@example.ng', sendEmail);
    await expect(channel.send({ to: 'a@b.ng', template: 'nope' })).rejects.toBeInstanceOf(
      UnknownTemplateError,
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
