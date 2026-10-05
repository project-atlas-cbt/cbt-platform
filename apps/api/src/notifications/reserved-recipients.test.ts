import { describe, expect, it, vi } from 'vitest';
import { isReservedRecipient, SkipReservedRecipients } from './reserved-recipients.js';

describe('reserved recipients (RFC 2606 / 6761)', () => {
  it.each([
    'f.adeyemi@oakridge.example',
    'a@school.test',
    'a@nowhere.invalid',
    'a@localhost',
    'a@example.com',
    'a@mail.example.org',
    'A@Riverside.EXAMPLE.',
  ])('treats %s as undeliverable', (address) => {
    expect(isReservedRecipient(address)).toBe(true);
  });

  it.each(['admin@school.ng', 'a@examkeep.com', 'a@example.ng', 'a@myexample.com', 'a@testing.ng'])(
    'delivers to %s',
    (address) => {
      expect(isReservedRecipient(address)).toBe(false);
    },
  );

  it('drops reserved recipients and passes every other message through', async () => {
    const send = vi.fn(() => Promise.resolve());
    const channel = new SkipReservedRecipients({ send });
    await channel.send({ to: 'c.okafor@oakridge.example', template: 'staff.invite' });
    expect(send).not.toHaveBeenCalled();
    const real = { to: 'admin@school.ng', template: 'staff.invite' };
    await channel.send(real);
    expect(send).toHaveBeenCalledWith(real);
  });
});
