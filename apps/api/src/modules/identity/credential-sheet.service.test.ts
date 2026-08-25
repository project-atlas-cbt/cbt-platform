import { describe, expect, it } from 'vitest';
import { CredentialSheetService, type CredentialSheetRow } from './credential-sheet.service.js';
import { PasswordService } from './password.service.js';

describe('CredentialSheetService.toCsv (ADR-0019/A-02 one-time-reveal primitive)', () => {
  const service = new CredentialSheetService(new PasswordService());

  const row = (overrides: Partial<CredentialSheetRow> = {}): CredentialSheetRow => ({
    studentId: 'ST001',
    displayName: 'Ada Lovelace',
    loginIdentifier: 'ST001',
    initialPassword: 'Xy7fPq9wKm',
    ...overrides,
  });

  it('renders a header row plus one row per student, CRLF-terminated', () => {
    const csv = service.toCsv([row()]);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('"Student ID","Name","Login Identifier","Initial Password"');
    expect(lines[1]).toBe('"ST001","Ada Lovelace","ST001","Xy7fPq9wKm"');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = service.toCsv([row({ displayName: 'Mary "MJ" John' })]);
    expect(csv).toContain('"Mary ""MJ"" John"');
  });

  it('defuses spreadsheet formula injection with a leading tab', () => {
    // Every one of the dangerous leading characters gets the same guard.
    for (const dangerous of ['=cmd|calc!A1', '+1+1', '-1+1', '@SUM(1,1)']) {
      expect(service.toCsv([row({ displayName: dangerous })])).toContain(`"\t${dangerous}"`);
    }
  });

  it('renders nothing but the header for an empty list', () => {
    const csv = service.toCsv([]);
    expect(csv.trim()).toBe('"Student ID","Name","Login Identifier","Initial Password"');
  });
});
