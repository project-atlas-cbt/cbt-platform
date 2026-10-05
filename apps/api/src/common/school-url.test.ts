import { describe, expect, it } from 'vitest';
import { buildSchoolUrl } from './school-url.js';

describe('buildSchoolUrl', () => {
  it('puts the school label on the root domain and keeps the web scheme and port', () => {
    expect(
      buildSchoolUrl(
        'http://localhost:3000',
        'localtest.me',
        'greenfield',
        '/reset-password?token=t',
      ),
    ).toBe('http://greenfield.localtest.me:3000/reset-password?token=t');
  });

  it('omits the port in production', () => {
    expect(
      buildSchoolUrl('https://examkeep.example', 'examkeep.example', 'kings', '/activate?key=k'),
    ).toBe('https://kings.examkeep.example/activate?key=k');
  });
});
