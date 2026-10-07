import { describe, expect, it } from 'vitest';
import { Prisma } from '@atlas/db';
import { csv, csvCell } from './csv.js';

describe('CSV serialization', () => {
  it('neutralizes spreadsheet formula cells before quoting them', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@formula')).toBe("'@formula");
  });

  it('uses RFC4180 quoting for commas, quotes and newlines', () => {
    expect(csv([['a,b', 'a"b', 'a\nb']])).toBe('"a,b","a""b","a\nb"\r\n');
  });

  it('also neutralizes a leading tab or carriage return (P3-3)', () => {
    expect(csvCell('\t=1+1')).toBe("'\t=1+1");
    expect(csvCell('\r=1+1')).toBe('"\'\r=1+1"');
  });

  it('writes a Prisma Decimal as a bare number, not quoted text (P2-11)', () => {
    expect(csvCell(new Prisma.Decimal('45.5'))).toBe('45.5');
    expect(csv([['x', new Prisma.Decimal('100')]])).toBe('x,100\r\n');
  });
});
