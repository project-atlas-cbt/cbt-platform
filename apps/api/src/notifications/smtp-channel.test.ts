import { TemplateRegistry, UnknownTemplateError } from '@atlas/notifications';
import { describe, expect, it, vi } from 'vitest';
import { SmtpNotificationChannel, type SmtpMail } from './smtp-channel.js';

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

describe('SmtpNotificationChannel (VPS pilot, ADR-0019 amendment)', () => {
  it('sends the rendered template from the configured sender', async () => {
    const sendMail = vi.fn<(mail: SmtpMail) => Promise<unknown>>(() => Promise.resolve({}));
    const channel = new SmtpNotificationChannel(
      registry(),
      'ExamKeep <no-reply@example.ng>',
      sendMail,
    );
    await channel.send({
      to: 'admin@school.ng',
      template: 'password.reset',
      variables: { school: 'Kings', link: 'https://kings.example.ng/r/abc' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'ExamKeep <no-reply@example.ng>',
      to: 'admin@school.ng',
      subject: 'Reset for Kings',
      text: 'Open https://kings.example.ng/r/abc',
      html: '<a href="https://kings.example.ng/r/abc">Reset</a>',
    });
  });

  it('reads the sender per message when given a function (ADR-0036)', async () => {
    const sendMail = vi.fn<(mail: SmtpMail) => Promise<unknown>>(() => Promise.resolve({}));
    let sender = '"Pilot" <a@example.ng>';
    const channel = new SmtpNotificationChannel(
      registry(),
      () => Promise.resolve(sender),
      sendMail,
    );
    await channel.send({
      to: 'x@school.ng',
      template: 'password.reset',
      variables: { school: 'K', link: 'l' },
    });
    sender = '"Exams" <b@example.ng>';
    await channel.send({
      to: 'x@school.ng',
      template: 'password.reset',
      variables: { school: 'K', link: 'l' },
    });
    expect(sendMail.mock.calls.map(([mail]) => mail.from)).toEqual([
      '"Pilot" <a@example.ng>',
      '"Exams" <b@example.ng>',
    ]);
  });

  it('rejects, so the dispatch queue retries, when the SMTP server fails', async () => {
    const channel = new SmtpNotificationChannel(registry(), 'no-reply@example.ng', () =>
      Promise.reject(new Error('421 try again later')),
    );
    await expect(
      channel.send({
        to: 'a@b.ng',
        template: 'password.reset',
        variables: { school: 'K', link: 'x' },
      }),
    ).rejects.toThrow('421');
  });

  it('refuses an unknown template before contacting the server', async () => {
    const sendMail = vi.fn<(mail: SmtpMail) => Promise<unknown>>();
    const channel = new SmtpNotificationChannel(registry(), 'no-reply@example.ng', sendMail);
    await expect(channel.send({ to: 'a@b.ng', template: 'nope' })).rejects.toBeInstanceOf(
      UnknownTemplateError,
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
